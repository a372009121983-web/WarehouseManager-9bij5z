import { useState } from 'react';
import { Package, Search, AlertTriangle, TrendingDown, CheckCircle, Edit2, RefreshCw, X } from 'lucide-react';
import { useInteraction } from '@/hooks/useInteraction';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

interface ProductInv {
  id: string; name: string; category: string | null; unit: string | null;
  min_stock: number; purchase_price: number; quantity: number; showroomQty: number;
}

const Inventory = () => {
  const { interact } = useInteraction();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('الكل');
  const [adjustItem, setAdjustItem] = useState<ProductInv | null>(null);
  const [newQty, setNewQty] = useState('');

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['inventory-all'],
    queryFn: async () => {
      const [{ data: prods }, { data: inv }, { data: showInv }] = await Promise.all([
        supabase.from('products').select('id, name, category, unit, min_stock, purchase_price').order('name'),
        supabase.from('inventory').select('product_id, quantity'),
        supabase.from('showroom_inventory').select('product_id, quantity'),
      ]);
      const mainTotals: Record<string, number> = {};
      (inv || []).forEach((r: any) => { mainTotals[r.product_id] = (mainTotals[r.product_id] || 0) + r.quantity; });
      const srTotals: Record<string, number> = {};
      (showInv || []).forEach((r: any) => { srTotals[r.product_id] = (srTotals[r.product_id] || 0) + r.quantity; });
      return (prods || []).map((p: any): ProductInv => ({
        id: p.id, name: p.name, category: p.category, unit: p.unit,
        min_stock: p.min_stock || 0, purchase_price: p.purchase_price || 0,
        quantity: mainTotals[p.id] || 0,
        showroomQty: srTotals[p.id] || 0,
      }));
    },
    staleTime: 30000,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ productId, quantity }: { productId: string; quantity: number }) => {
      const { data: wh } = await supabase.from('warehouses').select('id').order('created_at', { ascending: true }).limit(1).maybeSingle();
      if (!wh) {
        const { data: newWh } = await supabase.from('warehouses').insert({ name: 'المخزن الرئيسي', code: `WH-${Date.now()}`, type: 'رئيسي', status: 'نشط', capacity: 0, used: 0 }).select('id').single();
        if (!newWh) throw new Error('فشل إنشاء المخزن');
        await supabase.from('inventory').insert({ product_id: productId, warehouse_id: newWh.id, quantity });
        return;
      }
      const { data: existing } = await supabase.from('inventory').select('id').eq('product_id', productId).eq('warehouse_id', wh.id).maybeSingle();
      if (existing) {
        await supabase.from('inventory').update({ quantity, last_updated: new Date().toISOString() }).eq('id', existing.id);
      } else {
        await supabase.from('inventory').insert({ product_id: productId, warehouse_id: wh.id, quantity });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory-all'] });
      qc.invalidateQueries({ queryKey: ['products-inventory-totals'] });
      qc.invalidateQueries({ queryKey: ['products-showroom-totals'] });
      interact('success'); toast.success('تم تحديث المخزون'); setAdjustItem(null);
    },
    onError: (e: Error) => { interact('error'); toast.error(e.message); },
  });

  const getStatus = (qty: number, min: number) => qty === 0 ? 'نافد' : qty <= min ? 'منخفض' : 'وفير';

  const withStatus = items.map(i => ({ ...i, status: getStatus(i.quantity + i.showroomQty, i.min_stock) }));
  const filtered = withStatus.filter(item => {
    const mS = !search || item.name.includes(search) || (item.category || '').includes(search);
    const mF = filterStatus === 'الكل' || item.status === filterStatus;
    return mS && mF;
  });

  const counts = {
    total: items.length,
    وفير: withStatus.filter(i => i.status === 'وفير').length,
    منخفض: withStatus.filter(i => i.status === 'منخفض').length,
    نافد: withStatus.filter(i => i.status === 'نافد').length,
  };

  const statusConfig = {
    'وفير':  { icon: <CheckCircle className="w-3.5 h-3.5" />,  color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
    'منخفض': { icon: <TrendingDown className="w-3.5 h-3.5" />, color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200'   },
    'نافد':  { icon: <AlertTriangle className="w-3.5 h-3.5" />, color: 'text-red-700',     bg: 'bg-red-50 border-red-200'       },
  } as Record<string, { icon: React.ReactNode; color: string; bg: string }>;

  if (isLoading) return <div className="page-loader"><div className="page-loader-inner" /></div>;

  return (
    <div className="space-y-5">

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'إجمالي الأصناف', value: counts.total,       color: 'text-blue-700',    border: 'border-blue-100 bg-blue-50/70',    filter: 'الكل'   },
          { label: 'وفير',           value: counts['وفير'],    color: 'text-emerald-700', border: 'border-emerald-100 bg-emerald-50/70', filter: 'وفير'   },
          { label: 'منخفض',          value: counts['منخفض'],   color: 'text-amber-700',   border: 'border-amber-100 bg-amber-50/70',   filter: 'منخفض'  },
          { label: 'نافد',           value: counts['نافد'],    color: 'text-red-700',     border: 'border-red-100 bg-red-50/70',       filter: 'نافد'   },
        ].map(c => (
          <div key={c.label}
            className={cn('stat-card border cursor-pointer stat-shine transition-all', c.border, filterStatus === c.filter && 'ring-2 ring-[#1d6b6b]/25 shadow-md')}
            onClick={() => { interact('click'); setFilterStatus(c.filter); }}>
            <p className="text-xs text-slate-500 mb-1.5">{c.label}</p>
            <p className={cn('text-2xl font-bold', c.color)}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" placeholder="بحث بالمنتج أو الفئة..." value={search}
            onChange={e => setSearch(e.target.value)} className="app-input pr-10" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {['الكل', 'وفير', 'منخفض', 'نافد'].map(s => (
            <button key={s}
              className={cn('px-3 py-2 rounded-xl text-sm font-medium transition-all border',
                filterStatus === s ? 'text-white border-transparent shadow-sm' : 'bg-white text-slate-500 border-slate-200 hover:border-[#1d6b6b]/40 hover:text-[#1d6b6b]')}
              style={filterStatus === s ? { background: 'linear-gradient(135deg,#1d6b6b,#2a8f8f)' } : {}}
              onClick={() => { interact('click'); setFilterStatus(s); }}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ background: 'linear-gradient(135deg,#1d6b6b 0%,#2a8f8f 100%)' }}>
                {['المنتج', 'الفئة', 'الكمية', 'حد التنبيه', 'الحالة', 'إجراء'].map(h => (
                  <th key={h} className="tbl-head">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((item, i) => {
                const sc = statusConfig[item.status] || statusConfig['وفير'];
                return (
                  <tr key={item.id}
                    className={cn('tbl-row animate-fade-up', item.status === 'نافد' && 'bg-red-50/30')}
                    style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }}>
                    <td className="tbl-cell">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ background: 'linear-gradient(135deg,#1d6b6b,#2a8f8f)' }}>
                          <Package className="w-4 h-4 text-white" />
                        </div>
                        <div style={{overflow:'hidden'}}>
                          <p className="font-bold text-sm text-slate-800" style={{whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:'180px'}}>{item.name}</p>
                          {item.unit && <p className="text-xs text-slate-400">{item.unit}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="tbl-cell text-slate-500">{item.category || '—'}</td>
                    <td className="tbl-cell">
                      <span className={cn('text-lg font-bold',
                        item.status === 'نافد' ? 'text-red-600' : item.status === 'منخفض' ? 'text-amber-600' : 'text-emerald-600')}>
                        {(item.quantity + item.showroomQty).toLocaleString('ar-EG')}
                      </span>
                    </td>
                    <td className="tbl-cell text-slate-400">{item.min_stock}</td>
                    <td className="tbl-cell">
                      <span className={cn('badge', sc.color, sc.bg)}>
                        {sc.icon}{item.status}
                      </span>
                    </td>
                    <td className="tbl-cell">
                      <button
                        className="icon-btn w-8 h-8 bg-slate-100 hover:bg-[#e8f5f5] text-slate-500 hover:text-[#1d6b6b]"
                        onClick={() => { interact('click'); setAdjustItem(item); setNewQty(String(item.quantity)); }}>
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-14 text-center">
                  <Package className="w-10 h-10 mx-auto mb-3 opacity-20" />
                  <p className="text-slate-400 text-sm">لا توجد منتجات</p>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/50 flex justify-between items-center flex-wrap gap-2">
            <p className="text-xs text-slate-400">{filtered.length} صنف</p>
            <span className="text-xs text-slate-400">
              الإجمالي: <span className="font-bold text-emerald-600">{filtered.reduce((s, i) => s + i.quantity + i.showroomQty, 0).toLocaleString('ar-EG')}</span>
            </span>
          </div>
        )}
      </div>

      {/* Adjust Quantity Modal */}
      {adjustItem && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl border border-slate-100 shadow-2xl p-6 animate-fade-up">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="modal-icon w-10 h-10">
                  <RefreshCw className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-bold text-slate-800">تعديل الكمية</h2>
                  <p className="text-xs text-slate-400">{adjustItem.name}</p>
                </div>
              </div>
              <button className="icon-btn w-8 h-8 bg-slate-100 hover:bg-slate-200 text-slate-500" onClick={() => setAdjustItem(null)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="mb-5">
              <div className="flex gap-3 mb-4">
                <div className="flex-1 bg-slate-50 rounded-xl p-3 text-center border border-slate-200">
                  <p className="text-[10px] text-slate-400 mb-0.5">المخزن الحالي</p>
                  <p className="font-bold text-lg text-slate-800">{adjustItem.quantity.toLocaleString('ar-EG')}</p>
                </div>
                {adjustItem.showroomQty > 0 && (
                  <div className="flex-1 bg-[#e8f5f5] rounded-xl p-3 text-center border border-[#c5e0e0]">
                    <p className="text-[10px] text-[#1d6b6b] mb-0.5">في المعارض</p>
                    <p className="font-bold text-lg text-[#1d6b6b]">{adjustItem.showroomQty.toLocaleString('ar-EG')}</p>
                  </div>
                )}
              </div>
              <label className="text-xs font-semibold text-slate-600 block mb-1.5">الكمية الجديدة (المخزن)</label>
              <input type="number" value={newQty} onChange={e => setNewQty(e.target.value)} min={0} className="app-input" />
            </div>
            <div className="flex gap-3">
              <button className="btn-primary flex-1"
                onClick={() => {
                  const qty = parseInt(newQty);
                  if (isNaN(qty) || qty < 0) { interact('error'); toast.error('يرجى إدخال كمية صحيحة'); return; }
                  updateMutation.mutate({ productId: adjustItem.id, quantity: qty });
                }}
                disabled={updateMutation.isPending}>
                {updateMutation.isPending ? 'جاري الحفظ...' : 'حفظ'}
              </button>
              <button className="btn-secondary flex-1" onClick={() => setAdjustItem(null)}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;
