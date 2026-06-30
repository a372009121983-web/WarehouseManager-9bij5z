import { useState, useRef } from 'react';
import { Package, Plus, Edit2, Trash2, Search, Upload, X } from 'lucide-react';
import { useInteraction } from '@/hooks/useInteraction';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Product } from '@/types';

const EGP = (v: number) => v.toLocaleString('ar-EG', { minimumFractionDigits: 2 }) + ' ج.م';

interface InventoryTotals { [productId: string]: number }

const getMainWarehouseId = async (): Promise<string | null> => {
  const { data } = await supabase.from('warehouses').select('id').order('created_at', { ascending: true }).limit(1).maybeSingle();
  if (data) return data.id;
  const { data: created } = await supabase.from('warehouses').insert({
    name: 'المخزن الرئيسي', code: `WH-${Date.now()}`, type: 'رئيسي', status: 'نشط', capacity: 0, used: 0,
  }).select('id').single();
  return created?.id || null;
};

const Products = () => {
  const { interact } = useInteraction();
  const { profile } = useAuth();
  const qc = useQueryClient();
  const canDelete = profile?.role === 'admin' || profile?.role === 'warehouse_manager';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Product | null>(null);

  const emptyForm = { name: '', category: '', min_stock: 50, price: 0, purchase_price: 0, min_sale_price: 0, max_sale_price: 0, quantity: 0 };
  const [form, setForm] = useState(emptyForm);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('*').order('name');
      if (error) throw error;
      return data as Product[];
    },
    staleTime: 60000,
  });

  const { data: inventoryTotals = {} } = useQuery<InventoryTotals>({
    queryKey: ['products-inventory-totals'],
    queryFn: async () => {
      const { data } = await supabase.from('inventory').select('product_id, quantity');
      const totals: InventoryTotals = {};
      (data || []).forEach((row: any) => { totals[row.product_id] = (totals[row.product_id] || 0) + row.quantity; });
      return totals;
    },
    staleTime: 30000,
  });

  const { data: showroomTotals = {} } = useQuery<InventoryTotals>({
    queryKey: ['products-showroom-totals'],
    queryFn: async () => {
      const { data } = await supabase.from('showroom_inventory').select('product_id, quantity');
      const totals: InventoryTotals = {};
      (data || []).forEach((row: any) => { totals[row.product_id] = (totals[row.product_id] || 0) + row.quantity; });
      return totals;
    },
    staleTime: 30000,
  });

  const addMutation = useMutation({
    mutationFn: async (payload: typeof emptyForm) => {
      const sku = `P-${Date.now()}`;
      const { data: prod, error } = await supabase.from('products').insert({
        name: payload.name, category: payload.category,
        min_stock: payload.min_stock, price: payload.price,
        purchase_price: payload.purchase_price, min_sale_price: payload.min_sale_price,
        max_sale_price: payload.max_sale_price, sku, unit: '', barcode: '',
      }).select('id').single();
      if (error) throw error;
      if (payload.quantity > 0) {
        const whId = await getMainWarehouseId();
        if (whId) {
          const { data: existing } = await supabase.from('inventory').select('id,quantity').eq('product_id', prod.id).eq('warehouse_id', whId).maybeSingle();
          if (existing) {
            await supabase.from('inventory').update({ quantity: existing.quantity + payload.quantity, last_updated: new Date().toISOString() }).eq('id', existing.id);
          } else {
            await supabase.from('inventory').insert({ product_id: prod.id, warehouse_id: whId, quantity: payload.quantity });
          }
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['products-inventory-totals'] });
      qc.invalidateQueries({ queryKey: ['inventory-all'] });
      interact('success'); toast.success('تم إضافة المنتج');
      setShowForm(false);
    },
    onError: (e: Error) => { interact('error'); toast.error(e.message); },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: typeof emptyForm }) => {
      const { error } = await supabase.from('products').update({
        name: payload.name, category: payload.category,
        min_stock: payload.min_stock, price: payload.price,
        purchase_price: payload.purchase_price, min_sale_price: payload.min_sale_price,
        max_sale_price: payload.max_sale_price,
      }).eq('id', id);
      if (error) throw error;
      const whId = await getMainWarehouseId();
      if (whId) {
        const { data: existing } = await supabase.from('inventory').select('id,quantity').eq('product_id', id).eq('warehouse_id', whId).maybeSingle();
        if (existing) {
          await supabase.from('inventory').update({ quantity: payload.quantity, last_updated: new Date().toISOString() }).eq('id', existing.id);
        } else if (payload.quantity >= 0) {
          await supabase.from('inventory').insert({ product_id: id, warehouse_id: whId, quantity: payload.quantity });
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['products-inventory-totals'] });
      qc.invalidateQueries({ queryKey: ['inventory-all'] });
      interact('success'); toast.success('تم تحديث المنتج');
      setShowForm(false);
    },
    onError: (e: Error) => { interact('error'); toast.error(e.message); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('products').delete().eq('id', id); if (error) throw error; },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['products-inventory-totals'] });
      interact('delete'); toast.success('تم حذف المنتج');
    },
    onError: (e: Error) => { interact('error'); toast.error(e.message); },
  });

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = ev.target?.result as string;
      const rawLines = text.split('\n').slice(1).filter(l => l.trim());
      if (rawLines.length === 0) { toast.error('الملف فارغ'); return; }
      let count = 0;
      for (let idx = 0; idx < rawLines.length; idx++) {
        const cols = rawLines[idx].split(',');
        const name = cols[0]?.trim();
        if (!name) continue;
        const payload = {
          name, sku: `P-${Date.now()}-${idx}`, barcode: '', unit: '',
          category: cols[1]?.trim() || 'عام', min_stock: parseInt(cols[2]) || 50,
          purchase_price: parseFloat(cols[3]) || 0, price: parseFloat(cols[4]) || 0,
          min_sale_price: parseFloat(cols[5]) || 0, max_sale_price: parseFloat(cols[6]) || 0,
        };
        const { error } = await supabase.from('products').insert(payload);
        if (!error) count++;
      }
      qc.invalidateQueries({ queryKey: ['products'] });
      interact('success');
      toast.success(`تم استيراد ${count} منتج`);
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  };

  const openAdd = () => { interact('add'); setEditItem(null); setForm(emptyForm); setShowForm(true); };
  const openEdit = (product: Product) => {
    interact('click');
    setEditItem(product);
    const currentQty = inventoryTotals[product.id] || 0;
    setForm({
      name: product.name, category: product.category || '',
      min_stock: product.min_stock || 50, price: product.price,
      purchase_price: product.purchase_price || 0,
      min_sale_price: product.min_sale_price || 0, max_sale_price: product.max_sale_price || 0,
      quantity: currentQty,
    });
    setShowForm(true);
  };

  const handleSave = () => {
    if (!form.name) { interact('error'); toast.error('يرجى إدخال اسم المنتج'); return; }
    if (editItem) updateMutation.mutate({ id: editItem.id, payload: form });
    else addMutation.mutate(form);
  };

  const filtered = products.filter(p => p.name.includes(search) || (p.category || '').includes(search));

  if (isLoading) return <div className="page-loader"><div className="page-loader-inner" /></div>;

  return (
    <div className="space-y-5">
      <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleImportExcel} />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'إجمالي المنتجات', val: products.length, cls: 'border-blue-100 bg-blue-50/60', text: 'text-blue-700' },
          { label: 'الفئات', val: [...new Set(products.map(p => p.category).filter(Boolean))].length, cls: 'border-emerald-100 bg-emerald-50/60', text: 'text-emerald-700' },
          { label: 'متوسط سعر البيع', val: products.length ? EGP(Math.round(products.reduce((s, p) => s + p.price, 0) / products.length)) : '0 ج.م', cls: 'border-amber-100 bg-amber-50/60', text: 'text-amber-700' },
          { label: 'نافد المخزون', val: products.filter(p => (inventoryTotals[p.id] || 0) === 0).length, cls: 'border-red-100 bg-red-50/60', text: 'text-red-700' },
          { label: 'نافد المعارض', val: products.filter(p => (showroomTotals[p.id] || 0) === 0 && Object.keys(showroomTotals).some(k => true)).length, cls: 'border-orange-100 bg-orange-50/60', text: 'text-orange-700' },
        ].map((s, i) => (
          <div key={i} className={`stat-card border ${s.cls}`}>
            <p className="text-xs text-slate-500 mb-1.5">{s.label}</p>
            <p className={`text-2xl font-bold ${s.text} break-all`}>{s.val}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" placeholder="البحث بالاسم أو الفئة..." value={search}
            onChange={e => setSearch(e.target.value)} className="app-input pr-10" />
        </div>
        <button className="btn-secondary" onClick={() => fileInputRef.current?.click()}>
          <Upload className="w-4 h-4" /><span className="hidden sm:inline">استيراد CSV</span>
        </button>
        <button className="btn-primary" onClick={openAdd}>
          <Plus className="w-4 h-4" /><span>إضافة منتج</span>
        </button>
      </div>

      {/* Strip List */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ background: 'linear-gradient(135deg,#1d6b6b 0%,#2a8f8f 100%)' }}>
                <th className="tbl-head">المنتج</th>
                <th className="tbl-head hidden md:table-cell">الفئة</th>
                <th className="tbl-head">المخزن</th>
                <th className="tbl-head">المعارض</th>
                <th className="tbl-head hidden sm:table-cell">سعر الشراء</th>
                <th className="tbl-head hidden sm:table-cell">سعر البيع</th>
                <th className="tbl-head hidden lg:table-cell">حد التنبيه</th>
                <th className="tbl-head">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((product, i) => {
                const totalQty = (inventoryTotals[product.id] || 0) + (showroomTotals[product.id] || 0);
                const qtyStatus = totalQty === 0 ? 'نافد' : totalQty <= (product.min_stock || 0) ? 'منخفض' : 'وفير';
                const qtyColor = qtyStatus === 'نافد' ? 'text-red-600' : qtyStatus === 'منخفض' ? 'text-amber-600' : 'text-emerald-600';
                const profit = product.price - (product.purchase_price || 0);
                return (
                  <tr key={product.id} className="tbl-row animate-fade-up"
                    style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 bg-slate-800 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Package className="w-4 h-4 text-white" />
                        </div>
                        <div style={{overflow:'hidden'}}>
                          <p className="font-bold text-sm text-slate-800" style={{whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:'200px'}}>{product.name}</p>
                          {profit > 0 && <p className="text-[10px] text-emerald-600 font-medium">ربح: {EGP(profit)}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {product.category && <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-lg">{product.category}</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn('text-xl font-black block', (inventoryTotals[product.id] || 0) === 0 ? 'text-red-600' : (inventoryTotals[product.id] || 0) <= (product.min_stock || 0) ? 'text-amber-600' : 'text-emerald-600')}>
                        {(inventoryTotals[product.id] || 0).toLocaleString('ar-EG')}
                      </span>
                      <span className={cn('text-[10px] font-semibold', (inventoryTotals[product.id] || 0) === 0 ? 'text-red-500' : (inventoryTotals[product.id] || 0) <= (product.min_stock || 0) ? 'text-amber-500' : 'text-emerald-500')}>
                        {(inventoryTotals[product.id] || 0) === 0 ? 'نافد' : (inventoryTotals[product.id] || 0) <= (product.min_stock || 0) ? 'منخفض' : 'وفير'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {(showroomTotals[product.id] || 0) > 0
                        ? <span className="text-xl font-black text-blue-600">{(showroomTotals[product.id] || 0).toLocaleString('ar-EG')}</span>
                        : <span className="text-slate-300 text-sm">—</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500 hidden sm:table-cell">{product.purchase_price ? EGP(product.purchase_price) : '—'}</td>
                    <td className="px-4 py-3 font-bold text-sm text-emerald-600 hidden sm:table-cell">{EGP(product.price)}</td>
                    <td className="px-4 py-3 text-sm text-slate-400 hidden lg:table-cell">{product.min_stock || 0}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(product)}
                          title="تعديل المنتج"
                          style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
                          className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
                        >
                          <Edit2 className="w-4 h-4" style={{ pointerEvents: 'none' }} />
                        </button>
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`هل تريد حذف "${product.name}"؟\nلا يمكن التراجع عن هذه العملية.`))
                                deleteMutation.mutate(product.id);
                            }}
                            title="حذف المنتج"
                            style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
                            className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-red-50 hover:bg-red-100 text-red-500 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" style={{ pointerEvents: 'none' }} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Package className="w-12 h-12 mb-3 opacity-25" />
              <p className="text-sm font-medium mb-1">لا توجد منتجات</p>
              <p className="text-xs opacity-70">اضغط "إضافة منتج" للبدء</p>
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-100 animate-fade-up my-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="modal-icon">
                  <Package className="w-4 h-4" />
                </div>
                <h2 className="text-base font-bold text-slate-800">{editItem ? 'تعديل المنتج' : 'إضافة منتج جديد'}</h2>
              </div>
              <button className="flex items-center justify-center w-8 h-8 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-xl"
                onClick={() => { interact('click'); setShowForm(false); }}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-3">
              <div className="col-span-2 flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-600">اسم المنتج *</label>
                <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="أدخل اسم المنتج" className="app-input" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-600">الفئة</label>
                <input type="text" value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} placeholder="مثال: حبوب، زيوت..." className="app-input" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-600">حد التنبيه</label>
                <input type="number" value={form.min_stock || ''} onChange={e => setForm(p => ({ ...p, min_stock: Number(e.target.value) }))} className="app-input" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-600">سعر الشراء (ج.م)</label>
                <input type="number" value={form.purchase_price || ''} onChange={e => setForm(p => ({ ...p, purchase_price: Number(e.target.value) }))} className="app-input" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-600">سعر البيع (ج.م)</label>
                <input type="number" value={form.price || ''} onChange={e => setForm(p => ({ ...p, price: Number(e.target.value) }))} className="app-input" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-600">أدنى سعر بيع (ج.م)</label>
                <input type="number" value={form.min_sale_price || ''} onChange={e => setForm(p => ({ ...p, min_sale_price: Number(e.target.value) }))} className="app-input" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-600">أقصى سعر بيع (ج.م)</label>
                <input type="number" value={form.max_sale_price || ''} onChange={e => setForm(p => ({ ...p, max_sale_price: Number(e.target.value) }))} className="app-input" />
              </div>
              <div className="col-span-2 flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-600">{editItem ? 'الكمية الإجمالية (تحديث)' : 'الكمية الابتدائية'}</label>
                <input type="number" value={form.quantity !== 0 ? form.quantity : ''} min={0}
                  onChange={e => setForm(p => ({ ...p, quantity: Number(e.target.value) }))}
                  placeholder="0" className="app-input" />
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button className="btn-primary flex-1" onClick={handleSave}
                disabled={addMutation.isPending || updateMutation.isPending}>
                {(addMutation.isPending || updateMutation.isPending) ? 'جاري الحفظ...' : editItem ? 'حفظ التعديلات' : 'إضافة المنتج'}
              </button>
              <button className="btn-secondary flex-1" onClick={() => { interact('click'); setShowForm(false); }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Products;
