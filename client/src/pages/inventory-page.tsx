import { useQuery, useMutation } from "@tanstack/react-query";
import { Product, Credential, InsertCredential } from "@shared/schema";
import { api, buildUrl } from "@shared/routes";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter
} from "@/components/ui/dialog";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Key, Loader2, Search, Server, Edit2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertCredentialSchema } from "@shared/schema";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { useProducts } from "@/hooks/use-products";

export default function InventoryPage() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const { data: products } = useProducts();
  const [selectedProductId, setSelectedProductId] = useState<string>("all");

  const { data: credentials, isLoading } = useQuery<Credential[]>({
    queryKey: ["/api/all-credentials"],
    queryFn: async () => {
      const res = await fetch("/api/all-credentials");
      if (!res.ok) throw new Error("Failed to fetch credentials");
      return res.json();
    }
  });

  const form = useForm<InsertCredential>({
    resolver: zodResolver(insertCredentialSchema),
    defaultValues: {
      productId: 0,
      content: "",
      status: "available",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertCredential) => {
      // Split content by numbering pattern (e.g., "01 ", "02 ")
      // We look for digits followed by space at the start of lines
      const entries = data.content
        .split(/(?:\r?\n|^)\d+\s+/)
        .map(entry => entry.trim())
        .filter(entry => entry.length > 0);

      if (entries.length > 1) {
        // Bulk upload
        for (const entry of entries) {
          await apiRequest("POST", api.credentials.create.path, {
            ...data,
            content: entry
          });
        }
      } else {
        // Single upload
        await apiRequest("POST", api.credentials.create.path, data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/all-credentials"] });
      form.reset();
      toast({ title: "Credentials added successfully" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", buildUrl(api.credentials.delete.path, { id }));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/all-credentials"] });
      toast({ title: "Credential deleted" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number, data: Partial<InsertCredential> }) => {
      await apiRequest("PATCH", buildUrl(api.credentials.update.path, { id }), data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/all-credentials"] });
      toast({ title: "Credential updated successfully" });
    },
  });

  const filteredCredentials = credentials?.filter(cred => {
    const product = products?.find(p => p.id === cred.productId);
    const matchesSearch = cred.content.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         product?.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesProduct = selectedProductId === "all" || cred.productId === Number(selectedProductId);
    return matchesSearch && matchesProduct;
  });

  return (
    <div className="space-y-8 animate-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tighter drop-shadow-2xl">
            Inventory
          </h1>
          <p className="text-white/40 text-sm font-medium">Manage account credentials and stock.</p>
        </div>
        <div className="flex items-center gap-3">
           <Dialog>
            <DialogTrigger asChild>
              <Button className="h-11 px-6 rounded-xl bg-gradient-to-r from-purple-500 to-blue-600 hover:from-purple-600 hover:to-blue-700 text-white font-black text-xs uppercase tracking-widest shadow-lg transition-all duration-300 hover:scale-105 active:scale-95">
                <Plus className="mr-2 h-4 w-4" /> Add Credentials
              </Button>
            </DialogTrigger>
            <DialogContent className="glass-panel border-white/10 bg-background/95 backdrop-blur-3xl sm:max-w-[500px] rounded-3xl p-8 shadow-4xl">
              <DialogHeader>
                <DialogTitle className="text-2xl font-black text-white tracking-tighter flex items-center gap-3">
                  <Key className="w-5 h-5 text-purple-400" />
                  Add Stock
                </DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit((data) => createMutation.mutate(data))} className="space-y-6 pt-4">
                  <FormField
                    control={form.control}
                    name="productId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[9px] font-black uppercase tracking-widest text-white/30 ml-0.5">Select Product</FormLabel>
                        <Select onValueChange={(val) => field.onChange(Number(val))} defaultValue={field.value.toString()}>
                          <FormControl>
                            <SelectTrigger className="glass-panel h-11 rounded-xl border-white/5 bg-white/[0.02] text-sm text-white focus:border-purple-500/50 transition-all">
                              <SelectValue placeholder="Select a product" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="glass-panel border-white/10 bg-background text-white rounded-xl">
                            {products?.map(p => (
                              <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="content"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[9px] font-black uppercase tracking-widest text-white/30 ml-0.5">Account Details</FormLabel>
                        <FormControl>
                          <Textarea 
                            {...field} 
                            placeholder="Email: pass" 
                            className="glass-panel rounded-xl border-white/5 bg-white/[0.02] text-xs text-white placeholder:text-white/10 focus:border-purple-500/50 transition-all font-mono min-h-[120px] py-3"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button type="submit" disabled={createMutation.isPending} className="w-full bg-gradient-to-r from-purple-500 to-blue-600 text-white hover:opacity-90 font-black uppercase tracking-widest text-[9px] h-11 rounded-xl shadow-xl transition-all active:scale-95">
                      {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Add to Inventory
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within:text-purple-400 transition-colors" />
          <Input
            placeholder="Search credentials..."
            className="glass-panel pl-10 h-11 rounded-xl border-white/10 text-sm text-white placeholder:text-white/20 focus:border-purple-500/50 transition-all duration-500 shadow-xl"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Select value={selectedProductId} onValueChange={setSelectedProductId}>
          <SelectTrigger className="w-full sm:w-[200px] glass-panel h-11 rounded-xl border-white/10 text-sm text-white">
            <SelectValue placeholder="All Products" />
          </SelectTrigger>
          <SelectContent className="glass-panel border-white/10 bg-[#0f0a1e] text-white rounded-xl">
            <SelectItem value="all">All Products</SelectItem>
            {products?.map(p => (
              <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="glass-card border-0 rounded-2xl overflow-hidden shadow-2xl bg-white/[0.01] backdrop-blur-3xl">
        <Table>
          <TableHeader>
            <TableRow className="border-white/5 hover:bg-transparent">
              <TableHead className="text-white/40 font-bold uppercase tracking-widest text-[10px] pl-6 py-4">Product</TableHead>
              <TableHead className="text-white/40 font-bold uppercase tracking-widest text-[10px] py-4">Credentials</TableHead>
              <TableHead className="text-white/40 font-bold uppercase tracking-widest text-[10px] py-4">Status</TableHead>
              <TableHead className="text-white/40 font-bold uppercase tracking-widest text-[10px] text-right pr-6 py-4">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-12 text-white/20 text-xs">Loading...</TableCell>
              </TableRow>
            ) : filteredCredentials?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-48 text-center text-white/20 font-black text-sm uppercase tracking-tighter">
                  No stock found in inventory.
                </TableCell>
              </TableRow>
            ) : (
              filteredCredentials?.map((cred) => {
                const product = products?.find(p => p.id === cred.productId);
                return (
                  <TableRow key={cred.id} className="border-white/5 hover:bg-white/[0.03] transition-all duration-300 group">
                    <TableCell className="pl-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400">
                          <Server className="w-4 h-4" />
                        </div>
                        <span className="text-sm font-black text-white tracking-tight">{product?.name || "Unknown"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-[10px] text-white/60 max-w-[300px] truncate">
                      {cred.content}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`border-0 px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest ${cred.status === 'available' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                        {cred.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right pr-6">
                      <div className="flex justify-end gap-2">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-lg text-white/20 hover:text-purple-400 hover:bg-purple-500/10 transition-colors"
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="glass-panel border-white/10 bg-background/95 backdrop-blur-3xl sm:max-w-[500px] rounded-3xl p-8 shadow-4xl">
                            <DialogHeader>
                              <DialogTitle className="text-2xl font-black text-white tracking-tighter flex items-center gap-3">
                                <Edit2 className="w-5 h-5 text-purple-400" />
                                Edit Stock
                              </DialogTitle>
                            </DialogHeader>
                            <EditCredentialForm 
                              credential={cred} 
                              products={products || []} 
                              onSuccess={() => {}} 
                              mutation={updateMutation}
                            />
                          </DialogContent>
                        </Dialog>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          onClick={() => {
                            if (confirm("Delete this stock entry?")) {
                              deleteMutation.mutate(cred.id);
                            }
                          }}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function EditCredentialForm({ 
  credential, 
  products, 
  mutation 
}: { 
  credential: Credential, 
  products: Product[], 
  onSuccess: () => void,
  mutation: any
}) {
  const form = useForm<InsertCredential>({
    resolver: zodResolver(insertCredentialSchema),
    defaultValues: {
      productId: credential.productId,
      content: credential.content,
      status: credential.status as any,
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((data) => mutation.mutate({ id: credential.id, data }))} className="space-y-6 pt-4">
        <FormField
          control={form.control}
          name="productId"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-[9px] font-black uppercase tracking-widest text-white/30 ml-0.5">Select Product</FormLabel>
              <Select onValueChange={(val) => field.onChange(Number(val))} defaultValue={field.value.toString()}>
                <FormControl>
                  <SelectTrigger className="glass-panel h-11 rounded-xl border-white/5 bg-white/[0.02] text-sm text-white focus:border-purple-500/50 transition-all">
                    <SelectValue placeholder="Select a product" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent className="glass-panel border-white/10 bg-[#0f0a1e] text-white rounded-xl">
                  {products.map(p => (
                    <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="content"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-[9px] font-black uppercase tracking-widest text-white/30 ml-0.5">Account Details</FormLabel>
              <FormControl>
                <Textarea 
                  {...field} 
                  placeholder="Email: pass" 
                  className="glass-panel rounded-xl border-white/5 bg-white/[0.02] text-xs text-white placeholder:text-white/10 focus:border-purple-500/50 transition-all font-mono min-h-[120px] py-3"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-[9px] font-black uppercase tracking-widest text-white/30 ml-0.5">Status</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger className="glass-panel h-11 rounded-xl border-white/5 bg-white/[0.02] text-sm text-white focus:border-purple-500/50 transition-all">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent className="glass-panel border-white/10 bg-[#0f0a1e] text-white rounded-xl">
                  <SelectItem value="available">Available</SelectItem>
                  <SelectItem value="sold">Sold</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <DialogFooter>
          <Button type="submit" disabled={mutation.isPending} className="w-full bg-gradient-to-r from-purple-500 to-blue-600 text-white hover:opacity-90 font-black uppercase tracking-widest text-[9px] h-11 rounded-xl shadow-xl transition-all active:scale-95">
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Update Credential
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
