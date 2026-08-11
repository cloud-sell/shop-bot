import { useQuery, useMutation } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { queryClient } from "@/lib/queryClient";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Send, Plus, Trash2, Megaphone, Edit2, Save, X } from "lucide-react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

export default function BroadcastPage() {
  const { toast } = useToast();
  const [message, setMessage] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [buttonText, setButtonText] = useState("");
  const [buttonUrl, setButtonUrl] = useState("");
  const [botType, setBotType] = useState("main");
  const [uploading, setUploading] = useState(false);
  const [interval, setInterval] = useState("0");
  const [newChannel, setNewChannel] = useState({ channelId: "", name: "" });
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditingContent] = useState("");
  const [editImageUrl, setEditImageUrl] = useState("");
  const [editButtonText, setEditButtonText] = useState("");
  const [editButtonUrl, setEditButtonUrl] = useState("");
  const [editInterval, setEditInterval] = useState("0");

  const { data: channels, isLoading: channelsLoading } = useQuery<any[]>({
    queryKey: [api.broadcast.channels.list.path],
  });

  const { data: messages, isLoading: messagesLoading } = useQuery<any[]>({
    queryKey: [api.broadcast.messages.list.path],
  });

  const createChannelMutation = useMutation({
    mutationFn: async (data: { channelId: string; name: string }) => {
      const res = await fetch(api.broadcast.channels.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.broadcast.channels.list.path] });
      setNewChannel({ channelId: "", name: "" });
      toast({ title: "Success", description: "Channel added successfully" });
    },
  });

  const deleteChannelMutation = useMutation({
    mutationFn: async (id: number) => {
      await fetch(buildUrl(api.broadcast.channels.delete.path, { id }), {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.broadcast.channels.list.path] });
      toast({ title: "Success", description: "Channel removed" });
    },
  });

  const saveMessageMutation = useMutation({
    mutationFn: async (data: { content: string; imageUrl?: string; buttonText?: string; buttonUrl?: string; interval: number | null }) => {
      const res = await fetch(api.broadcast.messages.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to save message");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.broadcast.messages.list.path] });
      setMessage("");
      setImageUrl("");
      setButtonText("");
      setButtonUrl("");
      setInterval("0");
      toast({ title: "Saved", description: "Message saved to list" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const updateMessageMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: number; content?: string; imageUrl?: string; buttonText?: string; buttonUrl?: string; status?: string; interval?: number | null }) => {
      const res = await fetch(buildUrl(api.broadcast.messages.update.path, { id }), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.broadcast.messages.list.path] });
      setEditingId(null);
      toast({ title: "Updated", description: "Message updated" });
    },
  });

  const deleteMessageMutation = useMutation({
    mutationFn: async (id: number) => {
      await fetch(buildUrl(api.broadcast.messages.delete.path, { id }), {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.broadcast.messages.list.path] });
      toast({ title: "Deleted", description: "Message removed" });
    },
  });

  const broadcastMutation = useMutation({
    mutationFn: async (data: { message: string; imageUrl?: string; buttonText?: string; buttonUrl?: string; channelIds?: string[]; botType?: string }) => {
      const res = await fetch(api.broadcast.send.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: data.message,
          photo: data.imageUrl,
          channelIds: data.channelIds,
          message: data.message,
          buttonText: data.buttonText,
          buttonUrl: data.buttonUrl,
          botType: data.botType
        }),
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Broadcast Complete",
        description: `Successfully sent to ${data.count} recipients`,
      });
    },
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('image', file);

    try {
      const res = await fetch('/api/broadcast/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.imageUrl) {
        setImageUrl(data.imageUrl);
        toast({ title: "Success", description: "Image uploaded successfully" });
      }
    } catch (err) {
      toast({ title: "Error", description: "Failed to upload image", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleEditFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('image', file);

    try {
      const res = await fetch('/api/broadcast/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.imageUrl) {
        setEditImageUrl(data.imageUrl);
        toast({ title: "Success", description: "Image uploaded successfully" });
      }
    } catch (err) {
      toast({ title: "Error", description: "Failed to upload image", variant: "destructive" });
    }
  };

  const toggleChannel = (channelId: string) => {
    setSelectedChannels((prev) =>
      prev.includes(channelId)
        ? prev.filter((id) => id !== channelId)
        : [...prev, channelId]
    );
  };

  const [fromChatId, setFromChatId] = useState("");
  const [messageId, setMessageId] = useState("");

  const forwardMutation = useMutation({
    mutationFn: async (data: { fromChatId: string; messageId: string; channelIds: string[] }) => {
      const res = await fetch("/api/broadcast/forward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.count === 0 && data.failCount > 0) {
        toast({
          title: "Forward Failed",
          description: `Failed to forward to ${data.failCount} recipients. Check if the bot is a member of those chats.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Forward Complete",
          description: `Successfully forwarded to ${data.count} recipients${data.failCount > 0 ? ` (${data.failCount} failed)` : ""}`,
        });
      }
      setFromChatId("");
      setMessageId("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "An unexpected error occurred",
        variant: "destructive",
      });
    }
  });

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Broadcast</h1>
          <p className="text-white/40 mt-1">Send and manage automated messages.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <div className="xl:col-span-1 space-y-8">
          <Card className="glass-card border-0">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Megaphone className="w-5 h-5 text-purple-400" />
                Compose
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-white/40">Select Bot</label>
                <div className="flex gap-2">
                  <Button 
                    variant={botType === 'main' ? 'default' : 'outline'} 
                    className={`flex-1 ${botType === 'main' ? 'bg-purple-600' : 'border-white/10 text-white'}`}
                    onClick={() => setBotType('main')}
                  >
                    Main Bot
                  </Button>
                  <Button 
                    variant={botType === 'broadcast' ? 'default' : 'outline'} 
                    className={`flex-1 ${botType === 'broadcast' ? 'bg-purple-600' : 'border-white/10 text-white'}`}
                    onClick={() => setBotType('broadcast')}
                  >
                    Broadcast Bot
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-white/40">Interval (minutes, 0 for manual)</label>
                <Input
                  type="number"
                  min="0"
                  className="glass-panel border-white/10 text-white"
                  value={interval}
                  onChange={(e) => setInterval(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-white/40">Upload Image (Optional)</label>
                <div className="flex gap-2">
                  <Input
                    type="file"
                    accept="image/*"
                    className="glass-panel border-white/10 text-white cursor-pointer file:bg-purple-600 file:border-0 file:text-white file:rounded-md file:px-2 file:mr-2"
                    onChange={handleFileUpload}
                    disabled={uploading}
                  />
                  {imageUrl && (
                    <Button variant="ghost" size="icon" onClick={() => setImageUrl("")} className="text-red-400">
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                {imageUrl && (
                  <div className="mt-2 p-1 bg-white/5 rounded-lg border border-white/10 overflow-hidden">
                    <img 
                      src={imageUrl} 
                      className="w-full h-auto max-h-[300px] object-contain rounded-md" 
                      alt="Preview"
                      onLoad={(e) => {
                        const img = e.currentTarget;
                        console.log(`Preview image loaded: ${img.naturalWidth}x${img.naturalHeight}`);
                      }}
                      onError={() => {
                        console.error("Preview image failed to load:", imageUrl);
                        toast({ title: "Preview Error", description: "Failed to load image preview", variant: "destructive" });
                      }}
                    />
                  </div>
                )}
              </div>
              <Textarea
                placeholder="Enter message..."
                className="min-h-[150px] glass-panel border-white/10 text-white"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-white/40">Button Text</label>
                  <Input
                    placeholder="e.g. Visit Bot"
                    className="glass-panel border-white/10 text-white"
                    value={buttonText}
                    onChange={(e) => setButtonText(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-white/40">Button URL</label>
                  <Input
                    placeholder="t.me/yourbot"
                    className="glass-panel border-white/10 text-white"
                    value={buttonUrl}
                    onChange={(e) => setButtonUrl(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  className="flex-1 bg-purple-600 hover:bg-purple-500"
                  disabled={!message || broadcastMutation.isPending}
                  onClick={() => broadcastMutation.mutate({ message, imageUrl, buttonText, buttonUrl, channelIds: selectedChannels, botType })}
                >
                  Send Now
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 border-white/10 text-white"
                  disabled={!message || saveMessageMutation.isPending}
                  onClick={() => saveMessageMutation.mutate({ content: message, imageUrl, buttonText, buttonUrl, interval: Number(interval) || null })}
                >
                  Save Message
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card border-0">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Send className="w-5 h-5 text-blue-400" />
                Forward Message
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-white/40">From Chat ID</label>
                <Input
                  placeholder="e.g. -100123456789"
                  className="glass-panel border-white/10 text-white"
                  value={fromChatId}
                  onChange={(e) => setFromChatId(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-white/40">Message ID</label>
                <Input
                  placeholder="e.g. 1234"
                  className="glass-panel border-white/10 text-white"
                  value={messageId}
                  onChange={(e) => setMessageId(e.target.value)}
                />
                <p className="text-[10px] text-white/20">Copy message link to find ID (e.g. t.me/chat/<b>1234</b>)</p>
              </div>
              <Button
                className="w-full bg-blue-600 hover:bg-blue-500"
                disabled={!fromChatId || !messageId || forwardMutation.isPending}
                onClick={() => forwardMutation.mutate({ fromChatId, messageId, channelIds: selectedChannels })}
              >
                Forward Now
              </Button>
            </CardContent>
          </Card>

          <Card className="glass-card border-0">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-white">Channels</CardTitle>
              <Dialog>
                <DialogTrigger asChild>
                  <Button size="icon" variant="ghost" className="text-white/40 hover:text-white"><Plus className="w-4 h-4" /></Button>
                </DialogTrigger>
                <DialogContent className="glass-panel border-white/10 bg-[#0f0a1e]/90">
                  <DialogHeader><DialogTitle className="text-white">Add Channel</DialogTitle></DialogHeader>
                  <div className="space-y-4 pt-4">
                    <Input placeholder="Channel ID" className="glass-panel text-white" value={newChannel.channelId} onChange={e => setNewChannel({...newChannel, channelId: e.target.value})} />
                    <Input placeholder="Name" className="glass-panel text-white" value={newChannel.name} onChange={e => setNewChannel({...newChannel, name: e.target.value})} />
                    <Button className="w-full bg-purple-600" onClick={() => createChannelMutation.mutate(newChannel)}>Add</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <div className="max-h-[300px] overflow-auto">
                <Table>
                  <TableBody>
                    {channels?.map(channel => (
                      <TableRow key={channel.id} className="border-white/5">
                        <TableCell className="w-8"><Checkbox checked={selectedChannels.includes(channel.channelId)} onCheckedChange={() => toggleChannel(channel.channelId)} className="border-white/20" /></TableCell>
                        <TableCell className="text-white text-sm">{channel.name}</TableCell>
                        <TableCell className="text-right"><Button size="icon" variant="ghost" onClick={() => deleteChannelMutation.mutate(channel.id)} className="text-white/20 hover:text-red-400"><Trash2 className="w-4 h-4" /></Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="xl:col-span-2">
          <Card className="glass-card border-0 h-full">
            <CardHeader><CardTitle className="text-white">Saved & Scheduled Messages</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-4">
                {messages?.map(msg => (
                  <div key={msg.id} className="p-4 rounded-2xl glass-panel border-white/5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {msg.interval ? (
                          <Badge className="bg-blue-500/10 text-blue-400">Every {msg.interval}m</Badge>
                        ) : (
                          <Badge variant="outline" className="text-white/40">Manual</Badge>
                        )}
                        <Badge className={msg.status === 'active' ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}>
                          {msg.status}
                        </Badge>
                        <Badge variant="outline" className="text-white/40">Sent: {msg.sentCount || 0}</Badge>
                      </div>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="text-white/40" onClick={() => {
                          if (msg.status === 'active') updateMessageMutation.mutate({ id: msg.id, status: 'paused' });
                          else updateMessageMutation.mutate({ id: msg.id, status: 'active' });
                        }}>
                          {msg.status === 'active' ? <X className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                        </Button>
                        <Button size="icon" variant="ghost" className="text-white/40" onClick={() => {
                          setEditingId(msg.id);
                          setEditingContent(msg.content);
                          setEditImageUrl(msg.imageUrl || "");
                          setEditButtonText(msg.buttonText || "");
                          setEditButtonUrl(msg.buttonUrl || "");
                          setEditInterval(msg.interval?.toString() || "0");
                        }}><Edit2 className="w-4 h-4" /></Button>
                        <Button size="icon" variant="ghost" className="text-white/40 hover:text-red-400" onClick={() => deleteMessageMutation.mutate(msg.id)}><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </div>
                    {editingId === msg.id ? (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <Input
                            type="file"
                            accept="image/*"
                            className="glass-panel border-white/10 text-white cursor-pointer"
                            onChange={handleEditFileUpload}
                          />
                          {editImageUrl && (
                            <Button variant="ghost" size="icon" onClick={() => setEditImageUrl("")} className="text-red-400">
                              <X className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                        {editImageUrl && (
                          <div className="mt-2 p-1 bg-white/5 rounded-lg border border-white/10 overflow-hidden">
                            <img 
                              src={editImageUrl} 
                              className="w-full h-auto max-h-[300px] object-contain rounded-md" 
                              alt="Edit Preview"
                              onLoad={(e) => {
                                const img = e.currentTarget;
                                console.log(`Edit preview image loaded: ${img.naturalWidth}x${img.naturalHeight}`);
                              }}
                              onError={() => {
                                console.error("Edit preview image failed to load:", editImageUrl);
                                toast({ title: "Preview Error", description: "Failed to load edit image preview", variant: "destructive" });
                              }}
                            />
                          </div>
                        )}
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-white/40">Interval (minutes)</label>
                          <Input
                            type="number"
                            min="0"
                            className="glass-panel text-white"
                            value={editInterval}
                            onChange={(e) => setEditInterval(e.target.value)}
                          />
                        </div>
                        <Textarea className="glass-panel text-white" value={editContent} onChange={e => setEditingContent(e.target.value)} />
                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            placeholder="Button Text"
                            className="glass-panel text-white"
                            value={editButtonText}
                            onChange={(e) => setEditButtonText(e.target.value)}
                          />
                          <Input
                            placeholder="Button URL"
                            className="glass-panel text-white"
                            value={editButtonUrl}
                            onChange={(e) => setEditButtonUrl(e.target.value)}
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" className="bg-purple-600" onClick={() => updateMessageMutation.mutate({ id: msg.id, content: editContent, imageUrl: editImageUrl, buttonText: editButtonText, buttonUrl: editButtonUrl, interval: Number(editInterval) })}>Save</Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {msg.imageUrl && (
                          <img src={msg.imageUrl} className="w-full max-h-[200px] object-cover rounded-xl border border-white/10" alt="Preview" />
                        )}
                        <p className="text-sm text-white/60 whitespace-pre-wrap">{msg.content}</p>
                        {msg.buttonText && (
                          <Button variant="outline" size="sm" className="w-full border-purple-500/30 text-purple-400 pointer-events-none">
                            {msg.buttonText}
                          </Button>
                        )}
                      </div>
                    )}
                    <Button variant="ghost" size="sm" className="w-full text-xs text-purple-400 hover:bg-purple-400/10" onClick={() => broadcastMutation.mutate({ message: msg.content, imageUrl: msg.imageUrl, buttonText: msg.buttonText, buttonUrl: msg.buttonUrl, channelIds: selectedChannels })}>
                      Broadcast This Now
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
