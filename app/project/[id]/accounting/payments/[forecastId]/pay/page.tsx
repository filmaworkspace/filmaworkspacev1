"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Inter } from "next/font/google";
import { auth, db, storage } from "@/lib/firebase";
import { doc, getDoc, getDocs, collection, updateDoc, Timestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import {
  ArrowLeft,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  Receipt,
  FileText,
  Wallet,
  PiggyBank,
  Shield,
  CircleDollarSign,
  Download,
  Upload,
  X,
  Check,
  Clock,
  Banknote,
  Building2,
  FileCheck,
  ExternalLink,
  ChevronDown,
  AlertTriangle,
  Landmark,
  Calendar,
  Users,
  File,
  Trash2,
} from "lucide-react";
import Link from "next/link";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

function cx(...args: (string | boolean | null | undefined)[]): string {
  return args.filter(Boolean).join(" ");
}

const PAYMENT_TYPES = {
  invoice: { label: "Factura", icon: Receipt, color: "emerald", isInvoice: true },
  partial: { label: "Pago parcial", icon: CircleDollarSign, color: "blue", isInvoice: false },
  proforma: { label: "Proforma", icon: FileText, color: "violet", isInvoice: false },
  budget: { label: "Presupuesto", icon: Wallet, color: "amber", isInvoice: false },
  deposit: { label: "Depósito", icon: PiggyBank, color: "indigo", isInvoice: false },
  guarantee: { label: "Fianza", icon: Shield, color: "slate", isInvoice: false },
};

type PaymentType = keyof typeof PAYMENT_TYPES;

interface PaymentItem {
  id: string;
  type: PaymentType;
  invoiceId?: string;
  invoiceNumber?: string;
  supplier: string;
  supplierId?: string;
  description: string;
  amount: number;
  partialAmount?: number;
  department?: string;
  addedBy: string;
  addedByName: string;
  addedAt: Date;
  status: "pending" | "completed";
  receiptUrl?: string;
  receiptName?: string;
  completedAt?: Date;
  completedBy?: string;
  completedByName?: string;
  iban?: string;
  bic?: string;
}

interface PaymentForecast {
  id: string;
  name: string;
  paymentDate: Date;
  type: "remesa" | "fuera_remesa";
  status: "draft" | "pending" | "completed";
  items: PaymentItem[];
  totalAmount: number;
  notes?: string;
  createdAt: Date;
  createdBy: string;
  createdByName: string;
}

interface CompanyData {
  fiscalName: string;
  taxId: string;
}

interface BankAccount {
  id: string;
  alias: string;
  fiscalName: string;
  taxId: string;
  iban: string;
  bic?: string;
  isDefault?: boolean;
}

interface SupplierData {
  id: string;
  name: string;
  iban?: string;
  bic?: string;
}

export default function PaymentPayPage() {
  const { id, forecastId } = useParams();
  const router = useRouter();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState("");
  const [forecast, setForecast] = useState<PaymentForecast | null>(null);
  const [companyData, setCompanyData] = useState<CompanyData | null>(null);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [selectedBankAccount, setSelectedBankAccount] = useState<BankAccount | null>(null);
  const [suppliers, setSuppliers] = useState<Record<string, SupplierData>>({});
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showSepaModal, setShowSepaModal] = useState(false);
  const [sepaDate, setSepaDate] = useState(new Date().toISOString().split("T")[0]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bulkFileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      if (!u) router.push("/");
      else {
        setUserId(u.uid);
        setUserName(u.displayName || u.email || "Usuario");
      }
    });
    return () => unsub();
  }, [router]);

  useEffect(() => {
    if (!userId || !id || !forecastId) return;
    
    const loadData = async () => {
      try {
        // Cargar forecast
        const forecastSnap = await getDoc(doc(db, `projects/${id}/paymentForecasts`, forecastId as string));
        if (!forecastSnap.exists()) {
          showToast("error", "Previsión no encontrada");
          router.push(`/project/${id}/payments`);
          return;
        }
        
        const data = forecastSnap.data();
        const forecastData: PaymentForecast = {
          id: forecastSnap.id,
          name: data.name,
          paymentDate: data.paymentDate?.toDate() || new Date(),
          type: data.type || "remesa",
          status: data.status,
          totalAmount: data.totalAmount || 0,
          notes: data.notes,
          createdAt: data.createdAt?.toDate() || new Date(),
          createdBy: data.createdBy,
          createdByName: data.createdByName,
          items: (data.items || []).map((item: any) => ({
            ...item,
            addedAt: item.addedAt?.toDate ? item.addedAt.toDate() : new Date(item.addedAt),
            completedAt: item.completedAt?.toDate ? item.completedAt.toDate() : undefined,
          })),
        };
        setForecast(forecastData);

        // Cargar datos de empresa
        const companySnap = await getDoc(doc(db, `projects/${id}/config`, "company"));
        if (companySnap.exists()) {
          setCompanyData(companySnap.data() as CompanyData);
        }

        // Cargar cuentas bancarias
        const bankAccountsSnap = await getDocs(collection(db, `projects/${id}/config/company/bankAccounts`));
        const accounts = bankAccountsSnap.docs.map(d => ({
          id: d.id,
          ...d.data()
        })) as BankAccount[];
        const sortedAccounts = accounts.sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0));
        setBankAccounts(sortedAccounts);
        // Seleccionar cuenta por defecto
        const defaultAccount = sortedAccounts.find(a => a.isDefault) || sortedAccounts[0];
        if (defaultAccount) setSelectedBankAccount(defaultAccount);

        // Cargar proveedores para obtener IBANs
        const suppliersMap: Record<string, SupplierData> = {};
        for (const item of forecastData.items) {
          if (item.supplierId && !suppliersMap[item.supplierId]) {
            const supplierSnap = await getDoc(doc(db, `projects/${id}/suppliers`, item.supplierId));
            if (supplierSnap.exists()) {
              const sData = supplierSnap.data();
              suppliersMap[item.supplierId] = {
                id: supplierSnap.id,
                name: sData.name,
                iban: sData.iban,
                bic: sData.bic,
              };
            }
          }
        }
        setSuppliers(suppliersMap);
        
        setLoading(false);
      } catch (error) {
        console.error("Error loading data:", error);
        showToast("error", "Error al cargar datos");
        setLoading(false);
      }
    };
    
    loadData();
  }, [userId, id, forecastId, router]);

  const formatCurrency = (amount: number) => 
    new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount || 0);
  
  const formatDate = (date: Date) => 
    date ? new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", year: "numeric" }).format(date) : "-";

  const pendingItems = forecast?.items.filter(i => i.status === "pending") || [];
  const completedItems = forecast?.items.filter(i => i.status === "completed") || [];
  const totalPending = pendingItems.reduce((sum, i) => sum + (i.partialAmount || i.amount), 0);
  const totalCompleted = completedItems.reduce((sum, i) => sum + (i.partialAmount || i.amount), 0);

  const toggleSelectAll = () => {
    if (selectedItems.size === pendingItems.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(pendingItems.map(i => i.id)));
    }
  };

  const toggleSelectItem = (itemId: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedItems(newSelected);
  };

  const handleMarkAsPaid = async (itemIds: string[]) => {
    if (!forecast || itemIds.length === 0) return;
    setSaving(true);
    
    try {
      const updatedItems = forecast.items.map(item => {
        if (itemIds.includes(item.id)) {
          return {
            ...item,
            status: "completed" as const,
            completedAt: new Date(),
            completedBy: userId,
            completedByName: userName,
          };
        }
        return item;
      });

      const allCompleted = updatedItems.every(item => item.status === "completed");
      
      await updateDoc(doc(db, `projects/${id}/paymentForecasts`, forecastId as string), {
        items: updatedItems,
        status: allCompleted ? "completed" : forecast.status,
      });

      // Actualizar facturas como pagadas
      for (const itemId of itemIds) {
        const item = forecast.items.find(i => i.id === itemId);
        if (item?.invoiceId && item.type === "invoice") {
          await updateDoc(doc(db, `projects/${id}/invoices`, item.invoiceId), {
            status: "paid",
            paidAt: Timestamp.now(),
            paymentForecastId: forecastId,
          });
        }
      }

      setForecast({
        ...forecast,
        items: updatedItems,
        status: allCompleted ? "completed" : forecast.status,
      });
      setSelectedItems(new Set());
      showToast("success", `${itemIds.length} pago(s) marcado(s) como completado(s)`);
    } catch (error) {
      console.error("Error:", error);
      showToast("error", "Error al actualizar pagos");
    } finally {
      setSaving(false);
    }
  };

  const handleUploadReceipt = async (itemId: string, file: File) => {
    if (!forecast) return;
    setUploadingItemId(itemId);
    
    try {
      const storageRef = ref(storage, `projects/${id}/receipts/${forecastId}/${itemId}_${file.name}`);
      await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(storageRef);

      const updatedItems = forecast.items.map(item => {
        if (item.id === itemId) {
          return {
            ...item,
            receiptUrl: downloadUrl,
            receiptName: file.name,
            status: "completed" as const,
            completedAt: new Date(),
            completedBy: userId,
            completedByName: userName,
          };
        }
        return item;
      });

      const allCompleted = updatedItems.every(item => item.status === "completed");

      await updateDoc(doc(db, `projects/${id}/paymentForecasts`, forecastId as string), {
        items: updatedItems,
        status: allCompleted ? "completed" : forecast.status,
      });

      // Actualizar factura
      const item = forecast.items.find(i => i.id === itemId);
      if (item?.invoiceId && item.type === "invoice") {
        await updateDoc(doc(db, `projects/${id}/invoices`, item.invoiceId), {
          status: "paid",
          paidAt: Timestamp.now(),
          paymentForecastId: forecastId,
        });
      }

      setForecast({
        ...forecast,
        items: updatedItems,
        status: allCompleted ? "completed" : forecast.status,
      });
      showToast("success", "Justificante subido correctamente");
    } catch (error) {
      console.error("Error:", error);
      showToast("error", "Error al subir justificante");
    } finally {
      setUploadingItemId(null);
    }
  };

  const handleBulkUpload = async (files: FileList) => {
    if (!forecast || files.length === 0) return;
    
    // Intentar emparejar archivos con items por número de factura
    // Formato esperado: FAC-001.pdf, FAC-002.pdf, etc.
    const uploadPromises: Promise<void>[] = [];
    const matchedItems: string[] = [];

    for (const file of Array.from(files)) {
      const fileName = file.name.toLowerCase();
      
      // Buscar item que coincida con el nombre del archivo
      for (const item of pendingItems) {
        const invoiceNum = item.invoiceNumber?.toLowerCase();
        if (invoiceNum && (
          fileName.includes(invoiceNum) || 
          fileName.includes(`fac-${invoiceNum}`) ||
          fileName.includes(`fac${invoiceNum}`)
        )) {
          matchedItems.push(item.id);
          uploadPromises.push(handleUploadReceipt(item.id, file));
          break;
        }
      }
    }

    if (matchedItems.length === 0) {
      showToast("error", "No se encontraron coincidencias. Nombra los archivos con el número de factura (ej: FAC-001.pdf)");
      return;
    }

    await Promise.all(uploadPromises);
    showToast("success", `${matchedItems.length} justificante(s) subido(s)`);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    
    if (e.dataTransfer.files.length > 0) {
      handleBulkUpload(e.dataTransfer.files);
    }
  }, [forecast, pendingItems]);

  const generateSepaXml = () => {
    if (!forecast || !selectedBankAccount) {
      showToast("error", "Selecciona una cuenta bancaria para generar SEPA");
      return;
    }

    const itemsToExport = selectedItems.size > 0 
      ? pendingItems.filter(i => selectedItems.has(i.id))
      : pendingItems;

    if (itemsToExport.length === 0) {
      showToast("error", "No hay pagos pendientes para exportar");
      return;
    }

    // Verificar que todos los items tienen IBAN
    const itemsWithoutIban = itemsToExport.filter(item => {
      const supplier = item.supplierId ? suppliers[item.supplierId] : null;
      return !supplier?.iban && !item.iban;
    });

    if (itemsWithoutIban.length > 0) {
      showToast("error", `${itemsWithoutIban.length} proveedor(es) sin IBAN configurado`);
      return;
    }

    const totalAmount = itemsToExport.reduce((sum, i) => sum + (i.partialAmount || i.amount), 0);
    const msgId = `REMESA-${forecast.id.substring(0, 8)}-${Date.now()}`;
    const creationDate = new Date().toISOString();
    const executionDate = sepaDate;

    let transactions = "";
    itemsToExport.forEach((item, index) => {
      const supplier = item.supplierId ? suppliers[item.supplierId] : null;
      const iban = supplier?.iban || item.iban || "";
      const bic = supplier?.bic || item.bic || "";
      const amount = (item.partialAmount || item.amount).toFixed(2);
      const reference = item.invoiceNumber ? `FAC-${item.invoiceNumber}` : item.description.substring(0, 35);

      transactions += `
      <CdtTrfTxInf>
        <PmtId>
          <EndToEndId>${msgId}-${index + 1}</EndToEndId>
        </PmtId>
        <Amt>
          <InstdAmt Ccy="EUR">${amount}</InstdAmt>
        </Amt>
        ${bic ? `<CdtrAgt><FinInstnId><BIC>${bic}</BIC></FinInstnId></CdtrAgt>` : ""}
        <Cdtr>
          <Nm>${escapeXml(item.supplier.substring(0, 70))}</Nm>
        </Cdtr>
        <CdtrAcct>
          <Id>
            <IBAN>${iban.replace(/\s/g, "")}</IBAN>
          </Id>
        </CdtrAcct>
        <RmtInf>
          <Ustrd>${escapeXml(reference)}</Ustrd>
        </RmtInf>
      </CdtTrfTxInf>`;
    });

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${msgId}</MsgId>
      <CreDtTm>${creationDate}</CreDtTm>
      <NbOfTxs>${itemsToExport.length}</NbOfTxs>
      <CtrlSum>${totalAmount.toFixed(2)}</CtrlSum>
      <InitgPty>
        <Nm>${escapeXml(selectedBankAccount.fiscalName)}</Nm>
        <Id>
          <OrgId>
            <Othr>
              <Id>${selectedBankAccount.taxId}</Id>
            </Othr>
          </OrgId>
        </Id>
      </InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${msgId}-INFO</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <BtchBookg>true</BtchBookg>
      <NbOfTxs>${itemsToExport.length}</NbOfTxs>
      <CtrlSum>${totalAmount.toFixed(2)}</CtrlSum>
      <PmtTpInf>
        <SvcLvl>
          <Cd>SEPA</Cd>
        </SvcLvl>
      </PmtTpInf>
      <ReqdExctnDt>${executionDate}</ReqdExctnDt>
      <Dbtr>
        <Nm>${escapeXml(selectedBankAccount.fiscalName)}</Nm>
      </Dbtr>
      <DbtrAcct>
        <Id>
          <IBAN>${selectedBankAccount.iban.replace(/\s/g, "")}</IBAN>
        </Id>
      </DbtrAcct>
      ${selectedBankAccount.bic ? `<DbtrAgt><FinInstnId><BIC>${selectedBankAccount.bic}</BIC></FinInstnId></DbtrAgt>` : ""}
      <ChrgBr>SLEV</ChrgBr>${transactions}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>`;

    // Descargar archivo
    const blob = new Blob([xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `SEPA_${forecast.name.replace(/\s/g, "_")}_${executionDate}.xml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setShowSepaModal(false);
    showToast("success", "Fichero SEPA generado correctamente");
  };

  const escapeXml = (str: string) => {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  };

  if (loading) {
    return (
      <div className={cx("min-h-screen bg-slate-50 flex items-center justify-center", inter.className)}>
        <div className="w-12 h-12 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
      </div>
    );
  }

  if (!forecast) {
    return (
      <div className={cx("min-h-screen bg-slate-50 flex items-center justify-center", inter.className)}>
        <div className="text-center">
          <AlertCircle size={48} className="text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500">Previsión no encontrada</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cx("min-h-screen bg-slate-50", inter.className)}>
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-top-2">
          <div className={cx(
            "flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg",
            toast.type === "success" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
          )}>
            {toast.type === "success" ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            <span className="text-sm font-medium">{toast.message}</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="px-6 md:px-8 lg:px-12 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push(`/project/${id}/payments`)}
                className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <ArrowLeft size={20} className="text-slate-600" />
              </button>
              <div>
                <div className="flex items-center gap-3">
                  <CreditCard size={24} className="text-emerald-600" />
                  <h1 className="text-xl font-semibold text-slate-900">{forecast.name}</h1>
                </div>
                <div className="flex items-center gap-4 mt-1 text-sm text-slate-500">
                  <span className="flex items-center gap-1">
                    <Calendar size={14} />
                    {formatDate(forecast.paymentDate)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users size={14} />
                    {forecast.items.length} pagos
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {pendingItems.length > 0 && (
                <button
                  onClick={() => setShowSepaModal(true)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors"
                >
                  <Landmark size={16} />
                  Generar fichero SEPA
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="px-6 md:px-8 lg:px-12 py-8">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                <Clock size={20} className="text-amber-600" />
              </div>
              <span className="text-sm font-medium text-slate-500">Pendiente</span>
            </div>
            <p className="text-2xl font-bold text-slate-900">{formatCurrency(totalPending)} €</p>
            <p className="text-xs text-slate-400 mt-1">{pendingItems.length} pagos</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                <CheckCircle2 size={20} className="text-emerald-600" />
              </div>
              <span className="text-sm font-medium text-slate-500">Completado</span>
            </div>
            <p className="text-2xl font-bold text-emerald-600">{formatCurrency(totalCompleted)} €</p>
            <p className="text-xs text-slate-400 mt-1">{completedItems.length} pagos</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center">
                <Banknote size={20} className="text-slate-600" />
              </div>
              <span className="text-sm font-medium text-slate-500">Total remesa</span>
            </div>
            <p className="text-2xl font-bold text-slate-900">{formatCurrency(totalPending + totalCompleted)} €</p>
            <p className="text-xs text-slate-400 mt-1">{forecast.items.length} pagos totales</p>
          </div>
        </div>

        {/* Pending Payments */}
        {pendingItems.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden mb-6">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Clock size={18} className="text-amber-500" />
                <h2 className="font-semibold text-slate-900">Pagos pendientes</h2>
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-lg">{pendingItems.length}</span>
              </div>
              <div className="flex items-center gap-2">
                {selectedItems.size > 0 && (
                  <button
                    onClick={() => handleMarkAsPaid(Array.from(selectedItems))}
                    disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
                  >
                    <Check size={16} />
                    Marcar {selectedItems.size} como pagado(s)
                  </button>
                )}
              </div>
            </div>

            {/* Bulk upload zone */}
            <div
              className={cx(
                "mx-6 mt-4 border-2 border-dashed rounded-xl p-4 transition-colors",
                dragOver ? "border-emerald-400 bg-emerald-50" : "border-slate-200 hover:border-slate-300"
              )}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              <div className="flex items-center justify-center gap-4 text-center">
                <Upload size={24} className={dragOver ? "text-emerald-500" : "text-slate-400"} />
                <div>
                  <p className="text-sm font-medium text-slate-700">
                    Arrastra justificantes aquí para subir varios a la vez
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Nombra los archivos con el número de factura (ej: FAC-001.pdf, 001.pdf)
                  </p>
                </div>
                <button
                  onClick={() => bulkFileInputRef.current?.click()}
                  className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Seleccionar archivos
                </button>
              </div>
              <input
                ref={bulkFileInputRef}
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png"
                className="hidden"
                onChange={(e) => e.target.files && handleBulkUpload(e.target.files)}
              />
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="px-6 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={selectedItems.size === pendingItems.length && pendingItems.length > 0}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">Proveedor</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">Documento</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">Descripción</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wide">Importe</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wide">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingItems.map((item) => {
                    const typeInfo = PAYMENT_TYPES[item.type];
                    const TypeIcon = typeInfo.icon;
                    const isSelected = selectedItems.has(item.id);

                    return (
                      <tr
                        key={item.id}
                        className={cx(
                          "border-b border-slate-50 hover:bg-slate-50/50 transition-colors",
                          isSelected && "bg-emerald-50/50"
                        )}
                      >
                        <td className="px-6 py-4">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectItem(item.id)}
                            className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          />
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center">
                              <Building2 size={16} className="text-slate-500" />
                            </div>
                            <span className="font-medium text-slate-900">{item.supplier}</span>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            {!typeInfo.isInvoice && (
                              <span className="w-2 h-2 rounded-full bg-red-500" title="No es factura" />
                            )}
                            <TypeIcon size={14} className={cx(
                              typeInfo.isInvoice ? "text-emerald-500" : "text-amber-500"
                            )} />
                            <span className={cx(
                              "font-mono text-sm",
                              typeInfo.isInvoice ? "text-slate-900" : "text-amber-700"
                            )}>
                              {item.invoiceNumber ? `FAC-${item.invoiceNumber}` : typeInfo.label}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <p className="text-sm text-slate-600 truncate max-w-[200px]">{item.description}</p>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <span className="font-semibold text-slate-900">
                            {formatCurrency(item.partialAmount || item.amount)} €
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-2">
                            <label className="cursor-pointer">
                              <input
                                type="file"
                                accept=".pdf,.jpg,.jpeg,.png"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleUploadReceipt(item.id, file);
                                }}
                              />
                              <span className={cx(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                                uploadingItemId === item.id
                                  ? "bg-slate-100 text-slate-400"
                                  : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                              )}>
                                <Upload size={12} />
                                {uploadingItemId === item.id ? "Subiendo..." : "Justificante"}
                              </span>
                            </label>
                            <button
                              onClick={() => handleMarkAsPaid([item.id])}
                              disabled={saving}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-200 transition-colors"
                            >
                              <Check size={12} />
                              Pagado
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Completed Payments */}
        {completedItems.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
              <CheckCircle2 size={18} className="text-emerald-500" />
              <h2 className="font-semibold text-slate-900">Pagos completados</h2>
              <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-lg">{completedItems.length}</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">Proveedor</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">Documento</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">Descripción</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wide">Importe</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wide">Justificante</th>
                  </tr>
                </thead>
                <tbody>
                  {completedItems.map((item) => {
                    const typeInfo = PAYMENT_TYPES[item.type];
                    const TypeIcon = typeInfo.icon;

                    return (
                      <tr key={item.id} className="border-b border-slate-50">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
                              <CheckCircle2 size={16} className="text-emerald-600" />
                            </div>
                            <span className="font-medium text-slate-900">{item.supplier}</span>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            <TypeIcon size={14} className="text-emerald-500" />
                            <span className="font-mono text-sm text-slate-700">
                              {item.invoiceNumber ? `FAC-${item.invoiceNumber}` : typeInfo.label}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <p className="text-sm text-slate-600 truncate max-w-[200px]">{item.description}</p>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <span className="font-semibold text-emerald-600">
                            {formatCurrency(item.partialAmount || item.amount)} €
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          {item.receiptUrl ? (
                            <a
                              href={item.receiptUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-200 transition-colors"
                            >
                              <FileCheck size={12} />
                              Ver
                              <ExternalLink size={10} />
                            </a>
                          ) : (
                            <span className="text-xs text-slate-400">Sin justificante</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Empty state */}
        {forecast.items.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <CreditCard size={28} className="text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Sin pagos</h3>
            <p className="text-slate-500 text-sm">Esta previsión no tiene pagos asignados</p>
          </div>
        )}

        {/* All completed message */}
        {pendingItems.length === 0 && completedItems.length > 0 && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center mt-6">
            <CheckCircle2 size={32} className="text-emerald-600 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-emerald-900">¡Todos los pagos completados!</h3>
            <p className="text-emerald-700 text-sm mt-1">Esta remesa ha sido procesada completamente</p>
          </div>
        )}
      </main>

      {/* SEPA Modal */}
      {showSepaModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowSepaModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center">
                  <Landmark size={20} className="text-slate-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Generar fichero SEPA</h3>
                  <p className="text-xs text-slate-500">Formato XML pain.001.001.03</p>
                </div>
              </div>
              <button onClick={() => setShowSepaModal(false)} className="p-2 hover:bg-slate-100 rounded-lg">
                <X size={18} className="text-slate-500" />
              </button>
            </div>
            
            <div className="p-6">
              {/* Selector de cuenta bancaria */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 mb-2">Cuenta ordenante</label>
                {bankAccounts.length > 0 ? (
                  <div className="space-y-2">
                    {bankAccounts.map((account) => (
                      <label
                        key={account.id}
                        className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                          selectedBankAccount?.id === account.id
                            ? "border-slate-900 bg-slate-50"
                            : "border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <input
                          type="radio"
                          name="bankAccount"
                          checked={selectedBankAccount?.id === account.id}
                          onChange={() => setSelectedBankAccount(account)}
                          className="w-4 h-4 text-slate-900 focus:ring-slate-900"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-slate-900">{account.alias}</p>
                            {account.isDefault && (
                              <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Principal</span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 truncate">{account.fiscalName}</p>
                          <p className="text-xs font-mono text-slate-400">{account.iban.replace(/(.{4})/g, "$1 ").trim()}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                    <AlertTriangle size={18} className="text-amber-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-800">Sin cuentas bancarias</p>
                      <p className="text-xs text-amber-700 mt-0.5">Añade una cuenta en Configuración → Cuentas bancarias</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 mb-2">Fecha de ejecución</label>
                <input
                  type="date"
                  value={sepaDate}
                  onChange={(e) => setSepaDate(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none text-sm"
                />
              </div>

              <div className="bg-slate-50 rounded-xl p-4 mb-6">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-slate-600">Pagos a incluir</span>
                  <span className="font-semibold text-slate-900">
                    {selectedItems.size > 0 ? selectedItems.size : pendingItems.length}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Importe total</span>
                  <span className="font-bold text-lg text-slate-900">
                    {formatCurrency(
                      selectedItems.size > 0
                        ? pendingItems.filter(i => selectedItems.has(i.id)).reduce((sum, i) => sum + (i.partialAmount || i.amount), 0)
                        : totalPending
                    )} €
                  </span>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowSepaModal(false)}
                  className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={generateSepaXml}
                  disabled={!selectedBankAccount}
                  className="flex-1 px-4 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Download size={16} />
                  Descargar XML
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
