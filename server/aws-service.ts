import { CloudTrailClient, LookupEventsCommand } from "@aws-sdk/client-cloudtrail";
import { ServiceQuotasClient, GetServiceQuotaCommand } from "@aws-sdk/client-service-quotas";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import { storage } from "./storage";
import axios from "axios";

const geoCache: Record<string, string> = {};

async function getGeoLocation(ip: string): Promise<string> {
  if (!ip || ip === "N/A" || ip === "127.0.0.1") return "Unknown";
  if (geoCache[ip]) return geoCache[ip];

  try {
    const response = await axios.get(`http://ip-api.com/json/${ip}`, { timeout: 5000 });
    const json = response.data;
    const location = json.city && json.country ? `${json.city}, ${json.country}` : "Unknown";
    geoCache[ip] = location;
    return location;
  } catch (error) {
    return "Unknown";
  }
}

export async function fetchActivity(account: any, lookbackDays: number = 1) {
  let errors: string[] = [];

  // ── STEP 1: Quick credential check using STS GetCallerIdentity ──
  // Only needs access key + secret key. Fastest and most reliable way to
  // detect if credentials are valid or account is suspended.
  try {
    const stsClient = new STSClient({
      region: "us-east-1",
      credentials: {
        accessKeyId: account.accessKey.trim(),
        secretAccessKey: account.secretKey.trim(),
      },
    });
    await stsClient.send(new GetCallerIdentityCommand({}));
    // If we get here, credentials are valid → account is active
  } catch (stsErr: any) {
    const stsMsg = stsErr.message || String(stsErr);
    
    // Explicitly check if the account is suspended by AWS
    const isSuspended = 
      stsMsg.toLowerCase().includes("suspended") ||
      stsMsg.toLowerCase().includes("subscriptionrequired") ||
      stsMsg.toLowerCase().includes("optinrequired");

    // Check if the credentials themselves are invalid or access is denied
    const isCredentialError = 
      stsMsg.includes("InvalidClientTokenId") ||
      stsMsg.includes("The security token included in the request is invalid") ||
      stsMsg.includes("UnrecognizedClientException") ||
      stsMsg.includes("AuthFailure") ||
      stsMsg.includes("InvalidAccessKeyId") ||
      stsMsg.includes("ExpiredToken") ||
      stsMsg.includes("SignatureDoesNotMatch") ||
      stsMsg.includes("NotAuthorized") ||
      stsMsg.includes("AccessDenied");

    if (isSuspended) {
      await storage.updateAwsAccount(account.id, {
        status: "suspended",
        lastError: `Account suspended check: ${stsMsg}`,
        lastChecked: new Date(),
        spotVcpu: 0, // Suspended accounts have no live capacity
      });
      return { success: false, error: stsMsg };
    } else if (isCredentialError) {
      await storage.updateAwsAccount(account.id, {
        status: "error",
        lastError: `Credential check failed: ${stsMsg}`,
        lastChecked: new Date(),
        spotVcpu: 0, // Invalid credentials mean no live capacity can be accessed
      });
      return { success: false, error: stsMsg };
    }

    // Network/other non-auth error — don't change status, just log
    console.warn(`[AWS-STS] Non-auth error for ${account.name}: ${stsMsg}`);
  }

  // Poll all major AWS regions to ensure we don't miss any regional activity
  const regionsToPoll = [
    "us-east-1", "us-east-2", "us-west-1", "us-west-2",
    "af-south-1", "ap-east-1", "ap-south-1", "ap-northeast-3", 
    "ap-northeast-2", "ap-southeast-1", "ap-southeast-2", "ap-northeast-1",
    "ca-central-1", "eu-central-1", "eu-west-1", "eu-west-2", 
    "eu-south-1", "eu-west-3", "eu-north-1", "me-south-1", "sa-east-1"
  ];
  
  // Ensure the account's specified region is at the top/included
  if (!regionsToPoll.includes(account.region)) {
    regionsToPoll.unshift(account.region);
  }

  // Fetch Spot vCPU Quota (once per sync)
  let spotVcpu: number | null = null;
  try {
    // Try Stockholm region specifically if the account region fails or for better compatibility with target code
    const quotaRegions = [account.region, "eu-north-1", "us-east-1"];
    const quotaCodes = ["L-34B43A08", "L-34B43A7F"];
    
    let found = false;
    for (const qRegion of quotaRegions) {
      if (found) break;
      
      const quotaClient = new ServiceQuotasClient({
        region: qRegion,
        credentials: {
          accessKeyId: account.accessKey.trim(),
          secretAccessKey: account.secretKey.trim(),
        },
      });

      for (const qCode of quotaCodes) {
        try {
          const response = await quotaClient.send(new GetServiceQuotaCommand({
            ServiceCode: "ec2",
            QuotaCode: qCode
          }));
          if (response.Quota?.Value !== undefined) {
            spotVcpu = response.Quota.Value;
            found = true;
            console.log(`[AWS-QUOTA] Found Spot vCPU for ${account.name} in ${qRegion} with ${qCode}: ${spotVcpu}`);
            break;
          }
        } catch (e: any) {
          // Log specific error for debugging if needed
          if (qRegion === account.region && qCode === "L-34B43A08") {
             console.log(`[AWS-QUOTA-DEBUG] Failed ${qRegion}/${qCode}: ${e.message}`);
          }
        }
      }
    }
  } catch (error) {
    console.error(`[AWS-QUOTA] Fatal failure for ${account.name}:`, error);
  }


  let totalEventsFound = 0;

  for (const region of regionsToPoll) {
    if (errors.length > 0) break;

    const client = new CloudTrailClient({
      region: region,
      credentials: {
        accessKeyId: account.accessKey.trim(),
        secretAccessKey: account.secretKey.trim(),
      },
    });

    let nextToken: string | undefined = undefined;
    let pagesFetched = 0;
    const startTime = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
    
    // Standard deep poll for key regions, but if lookback is more than 1 day, increase pages
    const maxPages = (region === "us-east-1" || region === "ap-south-1") 
      ? (lookbackDays > 1 ? 20 : 5) 
      : (lookbackDays > 1 ? 5 : 1);

    while (pagesFetched < maxPages) {
      const command: LookupEventsCommand = new LookupEventsCommand({
        MaxResults: 50,
        NextToken: nextToken,
        StartTime: startTime,
      });

      try {
        const response: any = await client.send(command);
        const events = response.Events || [];
        totalEventsFound += events.length;

        for (const event of events) {
          if (!event.CloudTrailEvent) continue;
          
          const cloudTrailEvent = JSON.parse(event.CloudTrailEvent);
          const eventTime = new Date(event.EventTime!);
          const eventName = event.EventName || "Unknown";
          const eventSource = event.EventSource || "Unknown";
          const ipAddress = cloudTrailEvent.sourceIPAddress || "N/A";
          const userAgent = cloudTrailEvent.userAgent || "N/A";
          const userName = event.Username || "N/A";
          const details = cloudTrailEvent;

          // Skip extremely frequent noise events (bot noise) to avoid cluttering the database
          const isNoise = [
            "ListManagedNotificationEvents", 
            "LookupEvents", 
            "GetServiceQuota", 
            "ListServiceQuotas", 
            "GetAccountQuota",
            "GetEventSelectors",
            "ListTags",
            "DescribeInstances"
          ].includes(eventName);
          
          if (!isNoise) {
            console.log(`- Event found: ${eventName} (${eventTime.toISOString()}) for ${userName}${ipAddress !== 'N/A' ? ' IP: ' + ipAddress : ''}`);
            
            const exists = await storage.getAwsActivityExists(account.id, eventTime, eventName);
            
            if (!exists) {
              console.log(`  -> Saving new event to DB: ${eventName} (${eventTime.toISOString()})`);
              const location = await getGeoLocation(ipAddress);
              await storage.createAwsActivity({
                awsAccountId: account.id,
                eventTime,
                eventName,
                eventSource,
                ipAddress,
                location,
                userName,
                userAgent,
                details: cloudTrailEvent,
              });
            }
          }
        }

        nextToken = (response as any).NextToken;
        if (!nextToken) break;
        pagesFetched++;
        
        // Small delay to avoid throttling during deep sync
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error: any) {
        const errorMsg = error.message || String(error);
        const isNotEnabledOrAccess = errorMsg.includes('is not enabled') || 
                                     errorMsg.includes('AccessDenied') ||
                                     errorMsg.includes('UnrecognizedClientException') ||
                                     errorMsg.includes('The security token included in the request is invalid');
        
        if (errorMsg.includes('ETIMEDOUT') || errorMsg.includes('ECONN') || errorMsg.includes('timeout')) {
          console.warn(`Network timeout in ${region}, skipping without marking error.`);
        } else if (isNotEnabledOrAccess) {
          console.warn(`Region ${region} is likely not enabled or has restricted access, skipping.`);
        } else {
          console.warn(`Warning fetching for ${account.name} in ${region}: ${errorMsg}`);
        }
        break; // Stop current region polling on error
      }
    }
  }

  const updateData: any = {
    lastChecked: new Date(),
    status: 'active',
    lastError: null,
    spotVcpu: spotVcpu
  };

  if (spotVcpu !== null) {
    // Capture initial vCPU if not already set
    if (account.initialVcpu === null || account.initialVcpu === undefined) {
      updateData.initialVcpu = spotVcpu;
    }
  }

  await storage.updateAwsAccount(account.id, { ...updateData });
  return { success: true, count: totalEventsFound };
}

// Background Sync Service
export async function startAwsBackgroundSync() {
  console.log("AWS Background sync service started...");
  
  // Wait 30 seconds after startup before first sync to reduce memory pressure
  await new Promise(r => setTimeout(r, 30 * 1000));
  
  // One-time cleanup of existing noise events to clear the UI
  try {
    console.log("Cleaning up existing AWS bot noise events...");
    await storage.deleteAwsNoise();
    console.log("Cleanup complete.");
  } catch (err) {
    console.error("Cleanup error:", err);
  }

  while (true) {
    try {
      // Periodic cleanup of expired payments
      await storage.expireOldPayments();
      
      const accounts = await storage.getAwsAccounts();

      for (const account of accounts) {
        console.log(`Syncing AWS account: ${account.name}...`);
        await fetchActivity(account);
        // Smart Delay: wait 2 seconds between accounts to avoid AWS throttling
        await new Promise(r => setTimeout(r, 2000));
      }
    } catch (error) {
      console.error("AWS Background sync error:", error);
    }
    // Wait 10 minutes before next full cycle
    await new Promise(r => setTimeout(r, 10 * 60 * 1000));
  }
}

