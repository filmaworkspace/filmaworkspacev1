"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Inter } from "next/font/google";
import { auth, db, storage } from "@/lib/firebase";
import { doc, getDoc, getDocs, collection, updateDoc, Timestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { ArrowLeft, CheckCircle2, AlertCircle, Receipt, FileText, Wallet, PiggyBank, Shield, CircleDollarSign, Download, Upload, X, Clock, Banknote, FileCheck, ExternalLink, AlertTriangle, Landmark, Calendar, Users, Trash2, ChevronDown, ChevronUp, Info, Euro, FileUp, CheckCircle, XCircle, Percent } from "lucide-react";
import Link from "next/link";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const cx = (...a: (string | boolean | null | undefined)[]) => a.filter(Boolean).join(" ");

const PAYMENT_TYPES = {
  invoice: { label: "Factura", icon: Receipt, bgColor: "bg-emerald-50", textColor: "text-emerald-600" },
  partial: { label: "Pago parcial", icon: CircleDollarSign, bgColor: "bg-blue-50", textColor: "text-blue-600" },
  proforma: { label: "Proforma", icon: FileText, bgColor: "bg-violet-50", textColor: "text-violet-600" },
  budget: { label: "Presupuesto", icon: Wallet, bgColor: "bg-amber-50", textColor: "text-amber-600" },
  deposit: { label: "Depósito", icon: PiggyBank, bgColor: "bg-indigo-50", textColor: "text-indigo-600" },
  guarantee: { label: "Fianza", icon: Shield, bgColor: "bg-slate-100", textColor: "text-slate-600" },
};
type PaymentType = keyof typeof PAYMENT_TYPES;

interface PaymentItem { id: string; type: PaymentType; invoiceId?: string; invoiceNumber?: string; supplier: string; supplierId?: string; description: string; amount: number; partialAmount?: number; addedAt: Date; status: "pending" | "completed"; receiptUrl?: string; receiptName?: string; completedAt?: Date; completedBy?: string; completedByName?: string; iban?: string; bic?: string; }
interface PaymentForecast { id: string; name: string; paymentDate: Date; type: "remesa" | "fuera_remesa"; status: "draft" | "pending" | "completed"; items: PaymentItem[]; totalAmount: number; createdAt: Date; createdBy: string; createdByName: string; }
interface BankAccount { id: string; alias: string; fiscalName: string; taxId: string; iban: string; bic?: string; isDefault?: boolean; }
interface SupplierData { id: string; name: string; iban?: string; bic?: string; }

export default function PaymentPayPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const forecastId = params?.forecastId as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState("");
  const [forecast, setForecast] = useState<PaymentForecast | null>(null);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [selectedBankAccount, setSelectedBankAccount] = useState<BankAccount | null>(null);
  const [suppliers, setSuppliers] = useState<Record<string, SupplierData>>({});
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ type: "success" | "error" | "warning"; message: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showSepaModal, setShowSepaModal] = useState(false);
  const [sepaDate, setSepaDate] = useState(new Date().toISOString().split("T")[0]);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [tempAmounts, setTempAmounts] = useState<Record<string, number>>({});
  const [itemReceipts, setItemReceipts] = useState<Record<string, { file: File; url: string }>>({});
  const bulkFileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (type: "success" | "error" | "warning", message: string) => { setToast({ type, message }); setTimeout(() => setToast(null), 4000); };
  const formatCurrency = (a: number) => new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(a || 0);
  const formatDate = (d: Date) => d ? new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", year: "numeric" }).format(d) : "-";

  useEffect(() => { const unsub = auth.onAuthStateChanged((u) => { if (!u) router.push("/"); else { setUserId(u.uid); setUserName(u.displayName || u.email || "Usuario"); } }); return () => unsub(); }, [router]);

  useEffect(() => {
    if (!userId || !id || !forecastId) return;
    const loadData = async () => {
      try {
        const forecastSnap = await getDoc(doc(db, `projects/${id}/paymentForecasts`, forecastId));
        if (!forecastSnap.exists()) { showToast("error", "Previsión no encontrada"); router.push(`/project/${id}/accounting/payments`); return; }
        const data = forecastSnap.data();
        const forecastData: PaymentForecast = { id: forecastSnap.id, name: data.name, paymentDate: data.paymentDate?.toDate() || new Date(), type: data.type || "remesa", status: data.status, totalAmount: data.totalAmount || 0, createdAt: data.createdAt?.toDate() || new Date(), createdBy: data.createdBy, createdByName: data.createdByName, items: (data.items || []).map((item: any) => ({ ...item, addedAt: item.addedAt?.toDate ? item.addedAt.toDate() : new Date(item.addedAt), completedAt: item.completedAt?.toDate ? item.completedAt.toDate() : undefined })) };
        setForecast(forecastData);
        const amounts: Record<string, number> = {};
        forecastData.items.forEach((item) => { amounts[item.id] = item.partialAmount || item.amount; });
        setTempAmounts(amounts);
        const bankAccountsSnap = await getDocs(collection(db, `projects/${id}/config/company/bankAccounts`));
        const accounts = bankAccountsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as BankAccount[];
        const sortedAccounts = accounts.sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0));
        setBankAccounts(sortedAccounts);
        if (sortedAccounts[0]) setSelectedBankAccount(sortedAccounts.find((a) => a.isDefault) || sortedAccounts[0]);
        const suppliersMap: Record<string, SupplierData> = {};
        for (const item of forecastData.items) { if (item.supplierId && !suppliersMap[item.supplierId]) { const supplierSnap = await getDoc(doc(db, `projects/${id}/suppliers`, item.supplierId)); if (supplierSnap.exists()) { const sData = supplierSnap.data(); suppliersMap[item.supplierId] = { id: supplierSnap.id, name: sData.name, iban: sData.iban, bic: sData.bic }; } } }
        setSuppliers(suppliersMap);
        setLoading(false);
      } catch (error) { console.error("Error:", error); showToast("error", "Error al cargar datos"); setLoading(false); }
    };
    loadData();
  }, [userId, id, forecastId, router]);

  const pendingItems = forecast?.items.filter((i) => i.status === "pending") || [];
  const completedItems = forecast?.items.filter((i) => i.status === "completed") || [];
  const totalPending = pendingItems.reduce((sum, i) => sum + (tempAmounts[i.id] || i.partialAmount || i.amount), 0);
  const totalCompleted = completedItems.reduce((sum, i) => sum + (i.partialAmount || i.amount), 0);

  const toggleSelectAll = () => { if (selectedItems.size === pendingItems.length) setSelectedItems(new Set()); else setSelectedItems(new Set(pendingItems.map((i) => i.id))); };
  const toggleSelectItem = (itemId: string) => { const n = new Set(selectedItems); if (n.has(itemId)) n.delete(itemId); else n.add(itemId); setSelectedItems(n); };
  const toggleExpandItem = (itemId: string) => { const n = new Set(expandedItems); if (n.has(itemId)) n.delete(itemId); else n.add(itemId); setExpandedItems(n); };
  const canPayItem = (item: PaymentItem) => !!itemReceipts[item.id];
  const canPaySelected = () => { const items = selectedItems.size > 0 ? pendingItems.filter((i) => selectedItems.has(i.id)) : []; return items.length > 0 && items.every((item) => canPayItem(item)); };

  const handleUploadReceipt = (itemId: string, file: File) => { const url = URL.createObjectURL(file); setItemReceipts((prev) => ({ ...prev, [itemId]: { file, url } })); showToast("success", "Justificante añadido"); };
  const handleRemoveReceipt = (itemId: string) => { setItemReceipts((prev) => { const n = { ...prev }; if (n[itemId]?.url) URL.revokeObjectURL(n[itemId].url); delete n[itemId]; return n; }); };

  const handleMarkAsPaid = async (itemIds: string[]) => {
    if (!forecast || itemIds.length === 0) return;
    const withoutReceipt = itemIds.filter((id) => !itemReceipts[id]);
    if (withoutReceipt.length > 0) { showToast("warning", `${withoutReceipt.length} pago(s) sin justificante`); return; }
    setSaving(true);
    try {
      const updatedItems = [...forecast.items];
      for (const itemId of itemIds) {
        const idx = updatedItems.findIndex((i) => i.id === itemId);
        if (idx === -1) continue;
        const item = updatedItems[idx];
        const receipt = itemReceipts[itemId];
        const payingAmount = tempAmounts[itemId] || item.partialAmount || item.amount;
        let receiptUrl = "", receiptName = "";
        if (receipt) { const storageRef = ref(storage, `projects/${id}/receipts/${forecastId}/${itemId}_${receipt.file.name}`); await uploadBytes(storageRef, receipt.file); receiptUrl = await getDownloadURL(storageRef); receiptName = receipt.file.name; }
        updatedItems[idx] = { ...item, status: "completed" as const, partialAmount: payingAmount, receiptUrl, receiptName, completedAt: new Date(), completedBy: userId || "", completedByName: userName };
        if (item.invoiceId) { const isPaidInFull = payingAmount >= item.amount * 0.99; await updateDoc(doc(db, `projects/${id}/invoices`, item.invoiceId), { status: isPaidInFull ? "paid" : "partial_paid", paidAmount: payingAmount, paidAt: Timestamp.now(), paymentForecastId: forecastId }); }
      }
      const allCompleted = updatedItems.every((item) => item.status === "completed");
      await updateDoc(doc(db, `projects/${id}/paymentForecasts`, forecastId), { items: updatedItems.map((item) => ({ ...item, addedAt: item.addedAt instanceof Date ? Timestamp.fromDate(item.addedAt) : item.addedAt, completedAt: item.completedAt instanceof Date ? Timestamp.fromDate(item.completedAt) : item.completedAt })), status: allCompleted ? "completed" : forecast.status });
      itemIds.forEach((itemId) => { if (itemReceipts[itemId]?.url) URL.revokeObjectURL(itemReceipts[itemId].url); });
      setForecast({ ...forecast, items: updatedItems, status: allCompleted ? "completed" : forecast.status });
      setSelectedItems(new Set());
      setItemReceipts((prev) => { const n = { ...prev }; itemIds.forEach((id) => delete n[id]); return n; });
      showToast("success", `${itemIds.length} pago(s) completado(s)`);
    } catch (error) { console.error("Error:", error); showToast("error", "Error al procesar pagos"); } finally { setSaving(false); }
  };

  const handleBulkUpload = (files: FileList) => {
    if (!forecast || files.length === 0) return;
    let matched = 0;
    for (const file of Array.from(files)) { const fn = file.name.toLowerCase(); for (const item of pendingItems) { const num = item.invoiceNumber?.toLowerCase(); if (num && (fn.includes(num) || fn.includes(`fac-${num}`) || fn.includes(`fac${num}`))) { handleUploadReceipt(item.id, file); matched++; break; } } }
    if (matched === 0) showToast("warning", "Sin coincidencias. Nombra archivos con nº factura"); else showToast("success", `${matched} justificante(s) añadido(s)`);
  };

  const handleDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length > 0) handleBulkUpload(e.dataTransfer.files); }, [forecast, pendingItems]);

  const escapeXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

  const generateSepaXml = () => {
    if (!forecast || !selectedBankAccount) { showToast("error", "Selecciona cuenta bancaria"); return; }
    const items = selectedItems.size > 0 ? pendingItems.filter((i) => selectedItems.has(i.id)) : pendingItems;
    if (items.length === 0) { showToast("error", "No hay pagos"); return; }
    const noIban = items.filter((item) => { const s = item.supplierId ? suppliers[item.supplierId] : null; return !s?.iban && !item.iban; });
    if (noIban.length > 0) { showToast("error", `${noIban.length} sin IBAN`); return; }
    const total = items.reduce((sum, i) => sum + (tempAmounts[i.id] || i.partialAmount || i.amount), 0);
    const msgId = `REMESA-${forecast.id.substring(0, 8)}-${Date.now()}`;
    let txs = "";
    items.forEach((item, idx) => { const s = item.supplierId ? suppliers[item.supplierId] : null; const iban = s?.iban || item.iban || ""; const bic = s?.bic || item.bic || ""; const amt = (tempAmounts[item.id] || item.partialAmount || item.amount).toFixed(2); const ref = item.invoiceNumber ? `FAC-${item.invoiceNumber}` : item.description.substring(0, 35); txs += `<CdtTrfTxInf><PmtId><EndToEndId>${msgId}-${idx + 1}</EndToEndId></PmtId><Amt><InstdAmt Ccy="EUR">${amt}</InstdAmt></Amt>${bic ? `<CdtrAgt><FinInstnId><BIC>${bic}</BIC></FinInstnId></CdtrAgt>` : ""}<Cdtr><Nm>${escapeXml(item.supplier.substring(0, 70))}</Nm></Cdtr><CdtrAcct><Id><IBAN>${iban.replace(/\s/g, "")}</IBAN></Id></CdtrAcct><RmtInf><Ustrd>${escapeXml(ref)}</Ustrd></RmtInf></CdtTrfTxInf>`; });
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03"><CstmrCdtTrfInitn><GrpHdr><MsgId>${msgId}</MsgId><CreDtTm>${new Date().toISOString()}</CreDtTm><NbOfTxs>${items.length}</NbOfTxs><CtrlSum>${total.toFixed(2)}</CtrlSum><InitgPty><Nm>${escapeXml(selectedBankAccount.fiscalName)}</Nm><Id><OrgId><Othr><Id>${selectedBankAccount.taxId}</Id></Othr></OrgId></Id></InitgPty></GrpHdr><PmtInf><PmtInfId>${msgId}-INFO</PmtInfId><PmtMtd>TRF</PmtMtd><BtchBookg>true</BtchBookg><NbOfTxs>${items.length}</NbOfTxs><CtrlSum>${total.toFixed(2)}</CtrlSum><PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf><ReqdExctnDt>${sepaDate}</ReqdExctnDt><Dbtr><Nm>${escapeXml(selectedBankAccount.fiscalName)}</Nm></Dbtr><DbtrAcct><Id><IBAN>${selectedBankAccount.iban.replace(/\s/g, "")}</IBAN></Id></DbtrAcct>${selectedBankAccount.bic ? `<DbtrAgt><FinInstnId><BIC>${selectedBankAccount.bic}</BIC></FinInstnId></DbtrAgt>` : ""}<ChrgBr>SLEV</ChrgBr>${txs}</PmtInf></CstmrCdtTrfInitn></Document>`;
    const blob = new Blob([xml], { type: "application/xml" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `SEPA_${forecast.name.replace(/\s/g, "_")}_${sepaDate}.xml`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    setShowSepaModal(false); showToast("success", "SEPA generado");
  };

  if (loading) return <div className={cx("min-h-screen bg-white flex items-center justify-center", inter.className)}><div className="w-10 h-10 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" /></div>;
  if (!forecast) return <div className={cx("min-h-screen bg-white flex items-center justify-center", inter.className)}><div className="text-center"><AlertCircle size={48} className="text-slate-300 mx-auto mb-4" /><p className="text-slate-500">Previsión no encontrada</p><Link href={`/project/${id}/accounting/payments`} className="text-sm text-blue-600 hover:underline mt-2 inline-block">Volver</Link></div></div>;

  return (
    <div className={cx("min-h-screen bg-white", inter.className)}>
      {toast && (<div className="fixed top-4 right-4 z-50 animate-in slide-in-from-top-2"><div className={cx("flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg", toast.type === "success" && "bg-emerald-600 text-white", toast.type === "error" && "bg-red-600 text-white", toast.type === "warning" && "bg-amber-500 text-white")}>{toast.type === "success" && <CheckCircle2 size={18} />}{toast.type === "error" && <AlertCircle size={18} />}{toast.type === "warning" && <AlertTriangle size={18} />}<span className="text-sm font-medium">{toast.message}</span></div></div>)}

      <header className="border-b border-slate-200 sticky top-0 z-40 bg-white">
        <div className="px-6 md:px-8 lg:px-12 xl:px-16 2xl:px-24 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button onClick={() => router.push(`/project/${id}/accounting/payments`)} className="p-2 hover:bg-slate-100 rounded-xl"><ArrowLeft size={20} className="text-slate-600" /></button>
              <div className="flex items-center gap-3">
                <Banknote size={24} className="text-slate-400" />
                <div>
                  <h1 className="text-2xl font-semibold text-slate-900">{forecast.name}</h1>
                  <div className="flex items-center gap-4 mt-0.5 text-sm text-slate-500">
                    <span className="flex items-center gap-1"><Calendar size={14} />{formatDate(forecast.paymentDate)}</span>
                    <span className="flex items-center gap-1"><Users size={14} />{forecast.items.length} pagos</span>
                    <span className={cx("px-2 py-0.5 rounded-lg text-xs font-medium", forecast.status === "completed" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>{forecast.status === "completed" ? "Completada" : "Pendiente"}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {pendingItems.length > 0 && (<>
                <button onClick={() => setShowSepaModal(true)} className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50"><Download size={16} />Generar SEPA</button>
                <button onClick={() => handleMarkAsPaid(selectedItems.size > 0 ? Array.from(selectedItems) : pendingItems.map((i) => i.id))} disabled={saving || (selectedItems.size > 0 ? !canPaySelected() : !pendingItems.every((i) => canPayItem(i)))} className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed">{saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <CheckCircle size={16} />}{selectedItems.size > 0 ? `Pagar ${selectedItems.size}` : "Pagar todos"}</button>
              </>)}
            </div>
          </div>
        </div>
      </header>

      <main className="px-6 md:px-8 lg:px-12 xl:px-16 2xl:px-24 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-2xl border border-slate-200 p-5"><div className="flex items-center gap-3 mb-3"><div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center"><Clock size={20} className="text-amber-600" /></div><span className="text-sm font-medium text-slate-500">Pendiente</span></div><p className="text-2xl font-bold text-slate-900">{formatCurrency(totalPending)} €</p><p className="text-xs text-slate-400 mt-1">{pendingItems.length} pagos</p></div>
          <div className="bg-white rounded-2xl border border-slate-200 p-5"><div className="flex items-center gap-3 mb-3"><div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center"><CheckCircle2 size={20} className="text-emerald-600" /></div><span className="text-sm font-medium text-slate-500">Completado</span></div><p className="text-2xl font-bold text-emerald-600">{formatCurrency(totalCompleted)} €</p><p className="text-xs text-slate-400 mt-1">{completedItems.length} pagos</p></div>
          <div className="bg-white rounded-2xl border border-slate-200 p-5"><div className="flex items-center gap-3 mb-3"><div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center"><Euro size={20} className="text-slate-600" /></div><span className="text-sm font-medium text-slate-500">Total remesa</span></div><p className="text-2xl font-bold text-slate-900">{formatCurrency(totalPending + totalCompleted)} €</p><div className="w-full h-1.5 bg-slate-100 rounded-full mt-3 overflow-hidden"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${((totalCompleted / (totalPending + totalCompleted)) * 100) || 0}%` }} /></div></div>
        </div>

        {pendingItems.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden mb-6">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3"><Clock size={18} className="text-amber-500" /><h2 className="font-semibold text-slate-900">Pagos pendientes</h2><span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-lg">{pendingItems.length}</span></div>
              <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer"><input type="checkbox" checked={selectedItems.size === pendingItems.length && pendingItems.length > 0} onChange={toggleSelectAll} className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500" />Seleccionar todos</label>
            </div>
            <div className={cx("mx-6 mt-4 border-2 border-dashed rounded-xl p-4 transition-colors", dragOver ? "border-emerald-400 bg-emerald-50" : "border-slate-200 hover:border-slate-300")} onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={handleDrop}>
              <div className="flex items-center justify-center gap-4 text-center">
                <FileUp size={24} className={dragOver ? "text-emerald-500" : "text-slate-400"} />
                <div><p className="text-sm font-medium text-slate-700">Arrastra justificantes para subir varios</p><p className="text-xs text-slate-500 mt-0.5">Nombra con nº factura (FAC-001.pdf)</p></div>
                <button onClick={() => bulkFileInputRef.current?.click()} className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Seleccionar</button>
              </div>
              <input ref={bulkFileInputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={(e) => e.target.files && handleBulkUpload(e.target.files)} />
            </div>
            <div className="divide-y divide-slate-100 mt-4">
              {pendingItems.map((item) => { const typeInfo = PAYMENT_TYPES[item.type]; const TypeIcon = typeInfo.icon; const isSelected = selectedItems.has(item.id); const isExpanded = expandedItems.has(item.id); const hasReceipt = !!itemReceipts[item.id]; const payingAmount = tempAmounts[item.id] || item.partialAmount || item.amount; const isPartial = payingAmount < item.amount;
                return (
                  <div key={item.id} className={cx("transition-colors", isSelected && "bg-slate-50")}>
                    <div className="px-6 py-4 flex items-center gap-4">
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelectItem(item.id)} className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500" />
                      <div className={cx("w-10 h-10 rounded-xl flex items-center justify-center", typeInfo.bgColor)}><TypeIcon size={18} className={typeInfo.textColor} /></div>
                      <div className="flex-1 min-w-0"><div className="flex items-center gap-2"><span className="font-medium text-slate-900">{item.supplier}</span>{item.invoiceNumber && <span className="text-xs font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-600">FAC-{item.invoiceNumber}</span>}</div><p className="text-sm text-slate-500 truncate">{item.description}</p></div>
                      <div className="text-right"><p className="font-semibold text-slate-900">{formatCurrency(payingAmount)} €</p>{isPartial && <p className="text-xs text-amber-600 flex items-center gap-1 justify-end"><Percent size={10} />Parcial de {formatCurrency(item.amount)} €</p>}</div>
                      <div className="flex items-center gap-2">
                        {hasReceipt ? <div className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-medium"><CheckCircle size={12} />Justificante</div> : <div className="flex items-center gap-1 px-2.5 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-medium"><XCircle size={12} />Sin justificante</div>}
                        <button onClick={() => toggleExpandItem(item.id)} className="p-2 hover:bg-slate-100 rounded-lg">{isExpanded ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}</button>
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="px-6 pb-4 ml-14">
                        <div className="bg-slate-50 rounded-xl p-4 space-y-4">
                          <div><label className="block text-xs font-medium text-slate-500 mb-2">Importe a pagar</label><div className="flex items-center gap-3"><div className="relative flex-1 max-w-[200px]"><input type="number" step="0.01" min="0.01" max={item.amount} value={tempAmounts[item.id] || item.amount} onChange={(e) => setTempAmounts((prev) => ({ ...prev, [item.id]: Math.min(parseFloat(e.target.value) || 0, item.amount) }))} className="w-full px-4 py-2.5 pr-8 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-slate-900 outline-none" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">€</span></div><span className="text-sm text-slate-500">de {formatCurrency(item.amount)} €</span>{payingAmount < item.amount && <button onClick={() => setTempAmounts((prev) => ({ ...prev, [item.id]: item.amount }))} className="text-xs text-blue-600 hover:underline">Pagar todo</button>}</div>{payingAmount < item.amount && <p className="text-xs text-amber-600 mt-2 flex items-center gap-1"><Info size={12} />Pago parcial: quedarán {formatCurrency(item.amount - payingAmount)} € pendientes</p>}</div>
                          <div><label className="block text-xs font-medium text-slate-500 mb-2">Justificante <span className="text-red-500">*</span></label>{hasReceipt ? <div className="flex items-center gap-3 p-3 bg-white border border-emerald-200 rounded-xl"><FileCheck size={20} className="text-emerald-600" /><div className="flex-1 min-w-0"><p className="text-sm font-medium text-slate-900 truncate">{itemReceipts[item.id].file.name}</p><p className="text-xs text-slate-500">{(itemReceipts[item.id].file.size / 1024).toFixed(1)} KB</p></div><a href={itemReceipts[item.id].url} target="_blank" rel="noopener noreferrer" className="p-2 hover:bg-slate-100 rounded-lg"><ExternalLink size={16} className="text-slate-500" /></a><button onClick={() => handleRemoveReceipt(item.id)} className="p-2 hover:bg-red-50 text-red-500 rounded-lg"><Trash2 size={16} /></button></div> : <label className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-slate-200 rounded-xl cursor-pointer hover:border-slate-300 hover:bg-slate-50"><Upload size={18} className="text-slate-400" /><span className="text-sm text-slate-600">Subir justificante</span><input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadReceipt(item.id, f); }} /></label>}</div>
                          <button onClick={() => handleMarkAsPaid([item.id])} disabled={!hasReceipt || saving} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed">{saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <CheckCircle size={16} />}Marcar como pagado</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {completedItems.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3"><CheckCircle2 size={18} className="text-emerald-500" /><h2 className="font-semibold text-slate-900">Pagos completados</h2><span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-lg">{completedItems.length}</span></div>
            <div className="divide-y divide-slate-100">
              {completedItems.map((item) => { const typeInfo = PAYMENT_TYPES[item.type]; return (
                <div key={item.id} className="px-6 py-4 flex items-center gap-4">
                  <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center"><CheckCircle2 size={18} className="text-emerald-600" /></div>
                  <div className="flex-1 min-w-0"><div className="flex items-center gap-2"><span className="font-medium text-slate-900">{item.supplier}</span>{item.invoiceNumber && <span className="text-xs font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-600">FAC-{item.invoiceNumber}</span>}</div><p className="text-sm text-slate-500 truncate">{item.description}</p></div>
                  <div className="text-right"><p className="font-semibold text-emerald-600">{formatCurrency(item.partialAmount || item.amount)} €</p>{item.completedAt && <p className="text-xs text-slate-400">{formatDate(item.completedAt)}</p>}</div>
                  {item.receiptUrl ? <a href={item.receiptUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-200"><FileCheck size={12} />Ver<ExternalLink size={10} /></a> : <span className="text-xs text-slate-400">Sin justificante</span>}
                </div>
              ); })}
            </div>
          </div>
        )}

        {forecast.items.length === 0 && <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center"><div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4"><Banknote size={28} className="text-slate-400" /></div><h3 className="text-lg font-semibold text-slate-900 mb-2">Sin pagos</h3><p className="text-slate-500 text-sm">Esta previsión no tiene pagos</p></div>}
        {pendingItems.length === 0 && completedItems.length > 0 && <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center mt-6"><CheckCircle2 size={32} className="text-emerald-600 mx-auto mb-3" /><h3 className="text-lg font-semibold text-emerald-900">¡Todos los pagos completados!</h3><p className="text-emerald-700 text-sm mt-1">Remesa procesada</p></div>}
      </main>

      {showSepaModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowSepaModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between"><div className="flex items-center gap-3"><Landmark size={24} className="text-slate-400" /><div><h3 className="text-lg font-semibold text-slate-900">Generar SEPA</h3><p className="text-xs text-slate-500">XML pain.001.001.03</p></div></div><button onClick={() => setShowSepaModal(false)} className="p-2 hover:bg-slate-100 rounded-lg"><X size={18} className="text-slate-500" /></button></div>
            <div className="p-6 space-y-6">
              <div><label className="block text-sm font-medium text-slate-700 mb-2">Cuenta ordenante</label>{bankAccounts.length > 0 ? <div className="space-y-2">{bankAccounts.map((acc) => <label key={acc.id} className={cx("flex items-center gap-3 p-3 rounded-xl border cursor-pointer", selectedBankAccount?.id === acc.id ? "border-slate-900 bg-slate-50" : "border-slate-200 hover:border-slate-300")}><input type="radio" name="bankAccount" checked={selectedBankAccount?.id === acc.id} onChange={() => setSelectedBankAccount(acc)} className="w-4 h-4 text-slate-900 focus:ring-slate-900" /><div className="flex-1 min-w-0"><div className="flex items-center gap-2"><p className="text-sm font-medium text-slate-900">{acc.alias}</p>{acc.isDefault && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Principal</span>}</div><p className="text-xs font-mono text-slate-400 mt-0.5">{acc.iban.replace(/(.{4})/g, "$1 ").trim()}</p></div></label>)}</div> : <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3"><AlertTriangle size={18} className="text-amber-600 mt-0.5" /><div><p className="text-sm font-medium text-amber-800">Sin cuentas</p><p className="text-xs text-amber-700 mt-0.5">Añade en Configuración</p></div></div>}</div>
              <div><label className="block text-sm font-medium text-slate-700 mb-2">Fecha ejecución</label><input type="date" value={sepaDate} onChange={(e) => setSepaDate(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 outline-none text-sm" /></div>
              <div className="bg-slate-50 rounded-xl p-4"><div className="flex items-center justify-between mb-3"><span className="text-sm text-slate-600">Pagos</span><span className="font-semibold text-slate-900">{selectedItems.size > 0 ? selectedItems.size : pendingItems.length}</span></div><div className="flex items-center justify-between"><span className="text-sm text-slate-600">Total</span><span className="font-bold text-lg text-slate-900">{formatCurrency(selectedItems.size > 0 ? pendingItems.filter((i) => selectedItems.has(i.id)).reduce((sum, i) => sum + (tempAmounts[i.id] || i.partialAmount || i.amount), 0) : totalPending)} €</span></div></div>
              <div className="flex gap-3"><button onClick={() => setShowSepaModal(false)} className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50">Cancelar</button><button onClick={generateSepaXml} disabled={!selectedBankAccount} className="flex-1 px-4 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 disabled:opacity-50 flex items-center justify-center gap-2"><Download size={16} />Descargar XML</button></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
