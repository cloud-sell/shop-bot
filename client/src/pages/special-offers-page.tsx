import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Product, SpecialOffer, InsertSpecialOffer, insertSpecialOfferSchema } from "@shared/schema";
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
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, MoreHorizontal, Trash, Loader2, Tag, Megaphone } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { useProducts } from "@/hooks/use-products";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const specialOfferFormSchema = insertSpecialOfferSchema.extend({
  price: z.coerce.number().min(0.01, "Price must be greater than 0"),
  bundleQuantity: z.coerce.number().min(1, "Quantity must be at least 1"),
  durationHours: z.string().optional().nullable(),
});

type SpecialOfferFormValues = z.infer<typeof specialOfferFormSchema>;

export default function SpecialOffersPage() {
  const { data: offers, isLoading } = useQuery<(SpecialOffer & { product: Product | null })[]>({
    queryKey: ["/api/special-offers"],
  });
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingOffer, setEditingOffer] = useState<(SpecialOffer & { product: Product | null }) | null>(null);
  const [deletingOffer, setDeletingOffer] = useState<number | null>(null);
  const { toast } = useToast();

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/special-offers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/special-offers"] });
      toast({ title: "Special offer deleted successfully" });
      setDeletingOffer(null);
    },
    onError: (error) => {
      toast({ 
        title: "Delete failed", 
        description: error.message,
        variant: "destructive" 
      });
    }
  });

  const broadcastMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/special-offers/${id}/broadcast`);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: "Broadcast Successful", 
        description: `Offer sent to ${data.count} users/channels.` 
      });
    },
    onError: (error: any) => {
      toast({ 
        title: "Broadcast Failed", 
        description: error.message,
        variant: "destructive" 
      });
    }
  });

  return (
    <div className="space-y-8 animate-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tighter drop-shadow-2xl">
            Special Offers
          </h1>
          <p className="text-white/40 text-sm font-medium">Manage bundle deals and discounts.</p>
        </div>
        <CreateOfferDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />
      </div>

      <EditOfferDialog 
        offer={editingOffer} 
        onOpenChange={(open) => !open && setEditingOffer(null)} 
      />

      <Dialog open={deletingOffer !== null} onOpenChange={(open) => !open && setDeletingOffer(null)}>
        <DialogContent className="glass-panel border-white/10 bg-[#0f0a1e]/90 backdrop-blur-3xl sm:max-w-[400px] rounded-3xl p-8 shadow-4xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-white tracking-tighter">Confirm Deletion</DialogTitle>
            <DialogDescription className="text-white/40 font-medium text-sm">
              Are you sure you want to delete this special offer? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-6 gap-3">
            <Button variant="ghost" onClick={() => setDeletingOffer(null)} className="h-10 px-6 rounded-xl text-white/40 hover:text-white hover:bg-white/5 font-black uppercase tracking-widest text-[9px]">
              Cancel
            </Button>
            <Button 
              disabled={deleteMutation.isPending} 
              onClick={() => deletingOffer && deleteMutation.mutate(deletingOffer)}
              className="h-10 px-6 rounded-xl bg-red-500 hover:bg-red-600 text-white font-black uppercase tracking-widest text-[9px] shadow-xl"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete Now"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="glass-card border-0 rounded-2xl overflow-hidden shadow-2xl bg-white/[0.01] backdrop-blur-3xl">
        <Table>
          <TableHeader>
            <TableRow className="border-white/5 hover:bg-transparent">
              <TableHead className="text-white/40 font-bold uppercase tracking-widest text-[10px] pl-6 py-4">Offer Name</TableHead>
              <TableHead className="text-white/40 font-bold uppercase tracking-widest text-[10px] py-4">Product</TableHead>
              <TableHead className="text-white/40 font-bold uppercase tracking-widest text-[10px] py-4">Bundle Qty</TableHead>
              <TableHead className="text-white/40 font-bold uppercase tracking-widest text-[10px] py-4">Bundle Price</TableHead>
              <TableHead className="text-white/40 font-bold uppercase tracking-widest text-[10px] py-4">Status</TableHead>
              <TableHead className="text-white/40 font-bold uppercase tracking-widest text-[10px] text-right pr-6 py-4">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i} className="border-white/5">
                  <TableCell colSpan={6} className="py-8"><Loader2 className="animate-spin text-white/20 mx-auto" /></TableCell>
                </TableRow>
              ))
            ) : offers?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-48 text-center text-white/20 font-black text-sm uppercase tracking-tighter">
                  No special offers found.
                </TableCell>
              </TableRow>
            ) : (
              offers?.map((offer) => (
                <TableRow key={offer.id} className="border-white/5 hover:bg-white/[0.03] transition-all duration-300 group">
                  <TableCell className="pl-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-yellow-500/20 to-orange-500/20 flex items-center justify-center text-yellow-400 group-hover:scale-105 transition-transform duration-300 shadow-md">
                        <Tag className="w-5 h-5" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-black text-white tracking-tight leading-tight">{offer.name}</span>
                        <span className="text-[10px] text-white/30 font-medium truncate max-w-[200px] leading-tight">
                          {offer.description}
                        </span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-white/60 text-xs font-bold">
                    {offer.product?.name || "Unknown Product"}
                  </TableCell>
                  <TableCell className="font-black text-white text-sm tracking-tighter">
                    {offer.bundleQuantity} pcs
                  </TableCell>
                  <TableCell className="font-black text-white text-base tracking-tighter">
                    ${(offer.price / 100).toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <Badge variant="outline" className={`border-0 px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest w-fit ${offer.status === 'active' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                        {offer.status}
                      </Badge>
                      {offer.expiresAt && (
                        <span className="text-[10px] text-white/30 font-bold whitespace-nowrap">
                          Exp: {new Date(offer.expiresAt).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right pr-6">
                    <div className="flex items-center justify-end gap-2">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className={`h-9 px-3 rounded-xl transition-all flex items-center gap-2 ${
                          broadcastMutation.isPending && broadcastMutation.variables === offer.id 
                            ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' 
                            : 'text-yellow-400/50 hover:text-yellow-400 hover:bg-yellow-400/10'
                        }`}
                        onClick={() => broadcastMutation.mutate(offer.id)}
                        disabled={broadcastMutation.isPending}
                        title="Broadcast to Telegram"
                      >
                        {broadcastMutation.isPending && broadcastMutation.variables === offer.id ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            <span className="text-[10px] font-black uppercase tracking-widest animate-pulse">Sending...</span>
                          </>
                        ) : (
                          <>
                            <Megaphone className="h-4 w-4" />
                            <span className="text-[10px] font-black uppercase tracking-widest">Broadcast</span>
                          </>
                        )}
                      </Button>
                      
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-9 w-9 p-0 rounded-xl text-white/20 hover:text-white hover:bg-white/5 transition-all">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="glass-panel border-white/10 bg-[#0f0a1e]/90 backdrop-blur-3xl rounded-xl p-1.5 shadow-4xl min-w-[160px]">
                          <DropdownMenuItem 
                            className="rounded-lg px-2.5 py-2 text-xs font-bold text-white hover:bg-white/5 cursor-pointer flex items-center gap-2"
                            onSelect={() => setEditingOffer(offer)}
                          >
                            <Tag className="w-3.5 h-3.5" />
                            Edit Offer
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            className="rounded-lg px-2.5 py-2 text-xs font-bold text-red-400 hover:bg-red-500/10 focus:bg-red-500/10 cursor-pointer flex items-center gap-2"
                            onSelect={() => setDeletingOffer(offer.id)}
                          >
                            <Trash className="w-3.5 h-3.5" />
                            Delete Offer
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function CreateOfferDialog({ open, onOpenChange }: { open: boolean, onOpenChange: (open: boolean) => void }) {
  const { data: products } = useProducts();
  const { toast } = useToast();
  
  const form = useForm<SpecialOfferFormValues>({
    resolver: zodResolver(specialOfferFormSchema),
    defaultValues: {
      name: "",
      productId: 0,
      description: "",
      bundleQuantity: 1,
      price: 0,
      status: "active",
      durationHours: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (values: SpecialOfferFormValues) => {
      const finalValues = {
        ...values,
        price: Math.round(values.price * 100),
        expiresAt: values.durationHours ? new Date(Date.now() + parseFloat(values.durationHours) * 60 * 60 * 1000).toISOString() : null
      };
      // remove durationHours before sending to API if not in schema, 
      // but schema has it optional so it's fine or I can just pick fields
      const { durationHours, ...apiData } = finalValues;
      await apiRequest("POST", "/api/special-offers", apiData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/special-offers"] });
      toast({ title: "Special offer created successfully" });
      onOpenChange(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create offer",
        description: error.message || "An unexpected error occurred",
        variant: "destructive"
      });
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="h-11 px-6 rounded-xl bg-gradient-to-r from-yellow-500 to-orange-600 hover:from-yellow-600 hover:to-orange-700 text-white font-black text-xs uppercase tracking-widest shadow-lg transition-all duration-300 hover:scale-105 active:scale-95">
          <Plus className="mr-2 h-4 w-4" /> Add Offer
        </Button>
      </DialogTrigger>
      <DialogContent className="glass-panel border-white/5 bg-[#0b0718]/95 backdrop-blur-3xl sm:max-w-[380px] rounded-2xl p-4 shadow-4xl animate-in fade-in zoom-in duration-300">
        <DialogHeader className="mb-2">
          <DialogTitle className="text-lg font-black text-white tracking-tighter flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-yellow-500 to-orange-600 flex items-center justify-center text-white shadow-sm">
              <Plus className="w-4 h-4" />
            </div>
            New Offer
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => createMutation.mutate(data))} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[8px] font-black uppercase tracking-widest text-white/30 ml-0.5">Offer Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Offer Name" className="glass-panel h-8 rounded-lg border-white/5 bg-white/[0.02] text-xs text-white" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="productId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[8px] font-black uppercase tracking-widest text-white/30 ml-0.5">Product</FormLabel>
                    <Select onValueChange={(v) => field.onChange(parseInt(v))} defaultValue={field.value.toString()}>
                      <FormControl>
                        <SelectTrigger className="glass-panel h-8 rounded-lg border-white/5 bg-white/[0.02] text-xs text-white">
                          <SelectValue placeholder="Select Product" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="glass-panel border-white/10 bg-[#0f0a1e] text-white rounded-xl">
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
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[8px] font-black uppercase tracking-widest text-white/30 ml-0.5">Status</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="glass-panel h-8 rounded-lg border-white/5 bg-white/[0.02] text-xs text-white">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="glass-panel border-white/10 bg-[#0f0a1e] text-white rounded-xl">
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="bundleQuantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[8px] font-black uppercase tracking-widest text-white/30 ml-0.5">Bundle Quantity</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="Qty" className="glass-panel h-8 rounded-lg border-white/5 bg-white/[0.02] text-xs text-white" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[8px] font-black uppercase tracking-widest text-white/30 ml-0.5">Bundle Price ($)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" placeholder="8.00" className="glass-panel h-8 rounded-lg border-white/5 bg-white/[0.02] text-xs text-white" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="durationHours"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[8px] font-black uppercase tracking-widest text-white/30 ml-0.5">Duration (Hours - Optional)</FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      step="0.5"
                      placeholder="Hours..."
                      className="glass-panel h-8 rounded-lg border-white/5 bg-white/[0.02] text-xs text-white focus:border-purple-500/50" 
                      value={field.value || ""} 
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[8px] font-black uppercase tracking-widest text-white/30 ml-0.5">Description (Optional)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Details..." className="glass-panel rounded-lg border-white/5 bg-white/[0.02] text-xs text-white min-h-[50px] resize-none" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="pt-2 border-t border-white/5 gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="h-8 px-3 rounded-lg text-white/40 hover:text-white hover:bg-white/5 font-black uppercase tracking-widest text-[8px]">
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending} className="h-8 px-5 rounded-lg bg-white text-black hover:bg-white/90 font-black uppercase tracking-widest text-[8px] shadow-sm">
                {createMutation.isPending ? "Creating..." : "Create Offer"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function EditOfferDialog({ offer, onOpenChange }: { offer: (SpecialOffer & { product: Product | null }) | null, onOpenChange: (open: boolean) => void }) {
  const { data: products } = useProducts();
  const { toast } = useToast();
  
  const form = useForm<SpecialOfferFormValues>({
    resolver: zodResolver(specialOfferFormSchema),
    defaultValues: {
      name: "",
      productId: 0,
      description: "",
      bundleQuantity: 1,
      price: 0,
      status: "active",
      durationHours: "",
    },
  });

  // Track if we need to reset the form (simple local state)
  const [lastOfferId, setLastOfferId] = useState<number | null>(null);

  // Use an effect to reset form when offer changes
  if (offer && offer.id !== lastOfferId) {
    setLastOfferId(offer.id);
    form.reset({
      name: offer.name,
      productId: offer.productId,
      description: offer.description || "",
      bundleQuantity: offer.bundleQuantity,
      price: offer.price / 100,
      status: offer.status as "active" | "inactive",
      durationHours: "",
    });
  }

  const updateMutation = useMutation({
    mutationFn: async (values: SpecialOfferFormValues) => {
      if (!offer) return;
      const finalValues = {
        ...values,
        price: Math.round(values.price * 100),
        expiresAt: values.durationHours ? new Date(Date.now() + parseFloat(values.durationHours) * 60 * 60 * 1000).toISOString() : offer.expiresAt
      };
      const { durationHours, ...apiData } = finalValues;
      await apiRequest("PATCH", `/api/special-offers/${offer.id}`, apiData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/special-offers"] });
      toast({ title: "Special offer updated successfully" });
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={offer !== null} onOpenChange={onOpenChange}>
      <DialogContent className="glass-panel border-white/5 bg-[#0b0718]/95 backdrop-blur-3xl sm:max-w-[380px] rounded-2xl p-4 shadow-4xl animate-in fade-in zoom-in duration-300 text-white">
        <DialogHeader className="mb-4">
          <DialogTitle className="text-xl font-black text-white tracking-tighter flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white shadow-md">
              <Tag className="w-4 h-4" />
            </div>
            Edit Special Offer
          </DialogTitle>
          <DialogDescription className="text-white/40 font-medium text-xs">
            Update the details of this bundle deal.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => updateMutation.mutate(data))} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[8px] font-black uppercase tracking-widest text-white/30 ml-0.5">Offer Name</FormLabel>
                  <FormControl>
                    <Input className="glass-panel h-9 rounded-lg border-white/5 bg-white/[0.02] text-xs text-white focus:border-purple-500/50" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="productId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[8px] font-black uppercase tracking-widest text-white/30 ml-0.5">Product</FormLabel>
                    <Select onValueChange={(v) => field.onChange(parseInt(v))} value={field.value.toString()}>
                      <FormControl>
                        <SelectTrigger className="glass-panel h-9 rounded-lg border-white/5 bg-white/[0.02] text-xs text-white focus:border-purple-500/50">
                          <SelectValue placeholder="Select Product" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="glass-panel border-white/10 bg-[#0f0a1e] text-white rounded-xl">
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
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[8px] font-black uppercase tracking-widest text-white/30 ml-0.5">Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="glass-panel h-9 rounded-lg border-white/5 bg-white/[0.02] text-xs text-white focus:border-purple-500/50">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="glass-panel border-white/10 bg-[#0f0a1e] text-white rounded-xl">
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="bundleQuantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[8px] font-black uppercase tracking-widest text-white/30 ml-0.5">Bundle Quantity</FormLabel>
                    <FormControl>
                      <Input type="number" className="glass-panel h-9 rounded-lg border-white/5 bg-white/[0.02] text-xs text-white focus:border-purple-500/50" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[8px] font-black uppercase tracking-widest text-white/30 ml-0.5">Bundle Price ($)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" className="glass-panel h-9 rounded-lg border-white/5 bg-white/[0.02] text-xs text-white focus:border-purple-500/50" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="durationHours"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[8px] font-black uppercase tracking-widest text-white/30 ml-0.5">Extend Duration (Hours - Optional)</FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      step="0.5"
                      placeholder="Add hours..."
                      className="glass-panel h-9 rounded-lg border-white/5 bg-white/[0.02] text-xs text-white focus:border-purple-500/50" 
                      value={field.value || ""} 
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[8px] font-black uppercase tracking-widest text-white/30 ml-0.5">Description (Optional)</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Info..." 
                      className="glass-panel min-h-[50px] rounded-lg border-white/5 bg-white/[0.02] text-xs text-white focus:border-purple-500/50 resize-none" 
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="pt-2 border-t border-white/5 gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="h-8 px-3 rounded-lg text-white/40 hover:text-white hover:bg-white/5 font-black uppercase tracking-widest text-[8px]">
                Cancel
              </Button>
              <Button type="submit" disabled={updateMutation.isPending} className="h-8 px-5 rounded-lg bg-white text-black hover:bg-white/90 font-black uppercase tracking-widest text-[8px] shadow-sm">
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
