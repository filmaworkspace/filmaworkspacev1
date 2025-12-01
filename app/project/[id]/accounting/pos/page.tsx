"use client";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Inter, Space_Grotesk } from "next/font/google";
import { useState, useEffect } from "react";
import { auth, db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  where,
  Timestamp,
} from "firebase/firestore";
import {
  Folder,
  FileText,
  Plus,
  Search,
  Eye,
  Edit,
  Trash2,
  Clock,
  CheckCircle,
  XCircle,
  X,
  FileEdit,
  DollarSign,
  Download,
  Receipt,
  History,
  AlertTriangle,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import jsPDF from "jspdf";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "700"] });

type POStatus = "draft" | "pending" | "approved" | "closed" | "cancelled";

interface POItem {
  description: string;
  budgetAccount?: string;
  subAccountId?: string;
  subAccountCode?: string;
  subAccountDescription?: string;
  quantity: number;
  unitPrice: number;
  baseAmount?: number;
  vatRate?: number;
  vatAmount?: number;
  irpfRate?: number;
  irpfAmount?: number;
  totalAmount: number;
}

interface ModificationRecord {
  date: Date;
  userId: string;
  userName: string;
  reason: string;
  previousVersion: number;
}

interface LinkedInvoice {
  id: string;
  number: string;
  totalAmount: number;
  baseAmount: number;
  status: string;
  createdAt: Date;
}

interface PO {
  id: string;
  number: string;
  version: number;
  supplier: string;
  supplierId: string;
  department?: string;
  poType?: string;
  currency?: string;
  generalDescription: string;
  description?: string;
  paymentTerms?: string;
  notes?: string;
  totalAmount: number;
  baseAmount?: number;
  vatAmount?: number;
  irpfAmount?: number;
  items: POItem[];
  attachmentUrl?: string;
  status: POStatus;
  committedAmount: number;
  invoicedAmount: number;
  remainingAmount: number;
  approvalSteps?: any[];
  currentApprovalStep?: number;
  createdAt: Date;
  createdBy: string;
  createdByName: string;
  approvedAt?: Date;
  approvedBy?: string;
  approvedByName?: string;
  closedAt?: Date;
  closedBy?: string;
  closedByName?: string;
  cancelledAt?: Date;
  cancelledBy?: string;
  cancelledByName?: string;
  cancellationReason?: string;
  modificationHistory?: ModificationRecord[];
}

export default function POsPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const [projectName, setProjectName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [pos, setPos] = useState<PO[]>([]);
  const [filteredPOs, setFilteredPOs] = useState<PO[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | POStatus>("all");
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedPO, setSelectedPO] = useState<PO | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showModifyModal, setShowModifyModal] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");
  const [modificationReason, setModificationReason] = useState("");
  const [processing, setProcessing] = useState(false);
  const [linkedInvoices, setLinkedInvoices] = useState<LinkedInvoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) setUserId(user.uid);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    loadData();
  }, [id]);

  useEffect(() => {
    filterPOs();
  }, [searchTerm, statusFilter, pos]);

  const loadData = async () => {
    try {
      setLoading(true);
      const projectDoc = await getDoc(doc(db, "projects", id));
      if (projectDoc.exists()) {
        setProjectName(projectDoc.data().name || "Proyecto");
      }

      const posSnapshot = await getDocs(query(collection(db, `projects/${id}/pos`), orderBy("createdAt", "desc")));

      const posData = posSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate(),
        approvedAt: doc.data().approvedAt?.toDate(),
        closedAt: doc.data().closedAt?.toDate(),
        cancelledAt: doc.data().cancelledAt?.toDate(),
        version: doc.data().version || 1,
        committedAmount: doc.data().committedAmount || 0,
        invoicedAmount: doc.data().invoicedAmount || 0,
        remainingAmount: doc.data().remainingAmount || 0,
        modificationHistory: (doc.data().modificationHistory || []).map((m: any) => ({
          ...m,
          date: m.date?.toDate() || new Date(),
        })),
      })) as PO[];

      setPos(posData);
    } catch (error) {
      console.error("Error cargando POs:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadLinkedInvoices = async (poId: string) => {
    setLoadingInvoices(true);
    try {
      const invoicesQuery = query(collection(db, `projects/${id}/invoices`), where("poId", "==", poId));
      const invoicesSnap = await getDocs(invoicesQuery);

      const invoices = invoicesSnap.docs.map((doc) => ({
        id: doc.id,
        number: doc.data().number,
        totalAmount: doc.data().totalAmount || 0,
        baseAmount: doc.data().baseAmount || doc.data().totalAmount || 0,
        status: doc.data().status,
        createdAt: doc.data().createdAt?.toDate() || new Date(),
      }));

      setLinkedInvoices(invoices);
    } catch (error) {
      console.error("Error cargando facturas:", error);
      setLinkedInvoices([]);
    } finally {
      setLoadingInvoices(false);
    }
  };

  const filterPOs = () => {
    let filtered = [...pos];

    if (searchTerm) {
      filtered = filtered.filter(
        (po) =>
          po.number.toLowerCase().includes(searchTerm.toLowerCase()) ||
          po.supplier.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (po.generalDescription || po.description || "").toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((po) => po.status === statusFilter);
    }

    setFilteredPOs(filtered);
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount || 0);
  };

  const formatDate = (date: Date) => {
    if (!date) return "-";
    return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", year: "numeric" }).format(date);
  };

  const formatDateTime = (date: Date) => {
    if (!date) return "-";
    return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
  };

  const generatePDF = (po: PO) => {
    const pdf = new jsPDF("p", "mm", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 20;
    let y = margin;

    const primaryColor: [number, number, number] = [30, 41, 59];
    const secondaryColor: [number, number, number] = [100, 116, 139];
    const lightBg: [number, number, number] = [248, 250, 252];
    const successColor: [number, number, number] = [16, 185, 129];
    const warningColor: [number, number, number] = [245, 158, 11];

    const drawRoundedRect = (x: number, y: number, w: number, h: number, r: number, color: [number, number, number]) => {
      pdf.setFillColor(...color);
      pdf.roundedRect(x, y, w, h, r, r, "F");
    };

    drawRoundedRect(0, 0, pageWidth, 45, 0, primaryColor);
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(24);
    pdf.setFont("helvetica", "bold");
    pdf.text("ORDEN DE COMPRA", margin, 20);
    pdf.setFontSize(32);
    pdf.text(`PO-${po.number}`, margin, 35);

    if (po.version > 1) {
      pdf.setFontSize(12);
      pdf.text(`V${String(po.version).padStart(2, "0")}`, margin + pdf.getTextWidth(`PO-${po.number}`) + 5, 35);
    }

    const statusText = po.status === "draft" ? "BORRADOR" : po.status === "pending" ? "PENDIENTE" : po.status === "approved" ? "APROBADA" : po.status === "closed" ? "CERRADA" : po.status === "cancelled" ? "ANULADA" : po.status.toUpperCase();

    const statusColor: [number, number, number] = po.status === "approved" ? successColor : po.status === "pending" ? warningColor : po.status === "draft" ? secondaryColor : [239, 68, 68];

    pdf.setFillColor(...statusColor);
    const statusWidth = pdf.getTextWidth(statusText) + 16;
    pdf.roundedRect(pageWidth - margin - statusWidth, 12, statusWidth, 10, 2, 2, "F");
    pdf.setFontSize(10);
    pdf.text(statusText, pageWidth - margin - statusWidth + 8, 19);
    pdf.setFont("helvetica", "normal");
    pdf.text(projectName, pageWidth - margin - pdf.getTextWidth(projectName), 35);

    y = 55;
    const boxWidth = (pageWidth - margin * 2 - 10) / 2;

    drawRoundedRect(margin, y, boxWidth, 35, 3, lightBg);
    pdf.setTextColor(...primaryColor);
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "bold");
    pdf.text("PROVEEDOR", margin + 5, y + 8);
    pdf.setTextColor(30, 41, 59);
    pdf.setFontSize(12);
    pdf.text(po.supplier, margin + 5, y + 18);

    drawRoundedRect(margin + boxWidth + 10, y, boxWidth, 35, 3, lightBg);
    pdf.setTextColor(...primaryColor);
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "bold");
    pdf.text("BASE IMPONIBLE", margin + boxWidth + 15, y + 8);
    pdf.setTextColor(30, 41, 59);
    pdf.setFontSize(18);
    pdf.text(`${formatCurrency(po.baseAmount || po.totalAmount)} €`, margin + boxWidth + 15, y + 20);
    pdf.setFontSize(9);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(...secondaryColor);
    pdf.text(`Total: ${formatCurrency(po.totalAmount)} €`, margin + boxWidth + 15, y + 28);

    y += 45;
    const dateBoxWidth = (pageWidth - margin * 2 - 20) / 3;

    drawRoundedRect(margin, y, dateBoxWidth, 22, 3, lightBg);
    pdf.setTextColor(...secondaryColor);
    pdf.setFontSize(8);
    pdf.text("FECHA", margin + 5, y + 8);
    pdf.setTextColor(30, 41, 59);
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "bold");
    pdf.text(formatDate(po.createdAt), margin + 5, y + 17);

    drawRoundedRect(margin + dateBoxWidth + 10, y, dateBoxWidth, 22, 3, lightBg);
    pdf.setTextColor(...secondaryColor);
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "normal");
    pdf.text("CREADO POR", margin + dateBoxWidth + 15, y + 8);
    pdf.setTextColor(30, 41, 59);
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "bold");
    pdf.text(po.createdByName || "-", margin + dateBoxWidth + 15, y + 17);

    drawRoundedRect(margin + (dateBoxWidth + 10) * 2, y, dateBoxWidth, 22, 3, lightBg);
    pdf.setTextColor(...secondaryColor);
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "normal");
    pdf.text("VERSIÓN", margin + (dateBoxWidth + 10) * 2 + 5, y + 8);
    pdf.setTextColor(30, 41, 59);
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "bold");
    pdf.text(`V${String(po.version).padStart(2, "0")}`, margin + (dateBoxWidth + 10) * 2 + 5, y + 17);

    y += 32;

    if (po.generalDescription || po.description) {
      pdf.setTextColor(...primaryColor);
      pdf.setFontSize(10);
      pdf.setFont("helvetica", "bold");
      pdf.text("DESCRIPCIÓN", margin, y);
      y += 6;
      drawRoundedRect(margin, y, pageWidth - margin * 2, 20, 3, lightBg);
      pdf.setTextColor(30, 41, 59);
      pdf.setFontSize(10);
      pdf.setFont("helvetica", "normal");
      const description = po.generalDescription || po.description || "";
      const splitDescription = pdf.splitTextToSize(description, pageWidth - margin * 2 - 10);
      pdf.text(splitDescription.slice(0, 3), margin + 5, y + 8);
      y += 28;
    }

    pdf.setTextColor(...primaryColor);
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "bold");
    pdf.text(`LÍNEAS (${po.items?.length || 0})`, margin, y);
    y += 6;

    drawRoundedRect(margin, y, pageWidth - margin * 2, 10, 2, primaryColor);
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(8);
    pdf.text("DESCRIPCIÓN", margin + 5, y + 7);
    pdf.text("CUENTA", margin + 85, y + 7);
    pdf.text("CANT.", margin + 115, y + 7);
    pdf.text("PRECIO", margin + 130, y + 7);
    pdf.text("BASE", pageWidth - margin - 25, y + 7);
    y += 12;

    const items = po.items || [];
    items.forEach((item, index) => {
      if (y > pageHeight - 50) {
        pdf.addPage();
        y = margin;
      }

      const rowBg: [number, number, number] = index % 2 === 0 ? [255, 255, 255] : lightBg;
      drawRoundedRect(margin, y, pageWidth - margin * 2, 12, 0, rowBg);

      pdf.setTextColor(30, 41, 59);
      pdf.setFontSize(9);
      pdf.setFont("helvetica", "normal");

      const descText = (item.description || "").substring(0, 40) + ((item.description || "").length > 40 ? "..." : "");
      pdf.text(descText, margin + 5, y + 8);

      pdf.setFontSize(8);
      pdf.setTextColor(...secondaryColor);
      pdf.text(item.subAccountCode || item.budgetAccount || "-", margin + 85, y + 8);

      pdf.setTextColor(30, 41, 59);
      pdf.text(String(item.quantity || 0), margin + 115, y + 8);
      pdf.text(`${formatCurrency(item.unitPrice || 0)}`, margin + 130, y + 8);

      pdf.setFont("helvetica", "bold");
      const itemBase = item.baseAmount || item.quantity * item.unitPrice || 0;
      pdf.text(`${formatCurrency(itemBase)} €`, pageWidth - margin - 25, y + 8);

      y += 12;
    });

    y += 5;
    const totalsX = pageWidth - margin - 70;
    drawRoundedRect(totalsX - 10, y, 80, 45, 3, lightBg);

    pdf.setFontSize(9);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(...secondaryColor);

    pdf.text("Base imponible:", totalsX - 5, y + 10);
    pdf.setTextColor(30, 41, 59);
    pdf.setFont("helvetica", "bold");
    pdf.text(`${formatCurrency(po.baseAmount || po.totalAmount)} €`, totalsX + 45, y + 10);

    if (po.vatAmount && po.vatAmount > 0) {
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(...secondaryColor);
      pdf.text("IVA:", totalsX - 5, y + 18);
      pdf.setTextColor(30, 41, 59);
      pdf.text(`${formatCurrency(po.vatAmount)} €`, totalsX + 45, y + 18);
    }

    if (po.irpfAmount && po.irpfAmount > 0) {
      pdf.setTextColor(...secondaryColor);
      pdf.text("IRPF:", totalsX - 5, y + 26);
      pdf.setTextColor(30, 41, 59);
      pdf.text(`-${formatCurrency(po.irpfAmount)} €`, totalsX + 45, y + 26);
    }

    pdf.setDrawColor(...primaryColor);
    pdf.setLineWidth(0.5);
    pdf.line(totalsX - 5, y + 32, totalsX + 65, y + 32);

    pdf.setTextColor(...primaryColor);
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "bold");
    pdf.text("TOTAL:", totalsX - 5, y + 40);
    pdf.text(`${formatCurrency(po.totalAmount)} €`, totalsX + 45, y + 40);

    const footerY = pageHeight - 15;
    pdf.setDrawColor(226, 232, 240);
    pdf.setLineWidth(0.3);
    pdf.line(margin, footerY - 8, pageWidth - margin, footerY - 8);

    pdf.setTextColor(...secondaryColor);
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "normal");
    pdf.text(`Generado el ${formatDateTime(new Date())}`, margin, footerY);

    pdf.setTextColor(...primaryColor);
    pdf.setFont("helvetica", "bold");
    pdf.text("workspace", pageWidth - margin - pdf.getTextWidth("workspace"), footerY);

    pdf.save(`PO-${po.number}${po.version > 1 ? `-V${String(po.version).padStart(2, "0")}` : ""}.pdf`);
  };

  const getStatusBadge = (status: POStatus) => {
    switch (status) {
      case "draft":
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-700">Borrador</span>;
      case "pending":
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-amber-100 text-amber-700">Pendiente</span>;
      case "approved":
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-emerald-100 text-emerald-700">Aprobada</span>;
      case "closed":
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-blue-100 text-blue-700">Cerrada</span>;
      case "cancelled":
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-red-100 text-red-700">Anulada</span>;
      default:
        return null;
    }
  };

  const getInvoiceStatusBadge = (status: string) => {
    switch (status) {
      case "pending_approval":
        return <span className="px-2 py-0.5 rounded-md text-xs bg-amber-100 text-amber-700">Pte. aprobación</span>;
      case "pending":
        return <span className="px-2 py-0.5 rounded-md text-xs bg-blue-100 text-blue-700">Pte. pago</span>;
      case "paid":
        return <span className="px-2 py-0.5 rounded-md text-xs bg-emerald-100 text-emerald-700">Pagada</span>;
      case "cancelled":
        return <span className="px-2 py-0.5 rounded-md text-xs bg-red-100 text-red-700">Anulada</span>;
      default:
        return <span className="px-2 py-0.5 rounded-md text-xs bg-slate-100 text-slate-700">{status}</span>;
    }
  };

  const handleClosePO = async (poId: string) => {
    const po = pos.find((p) => p.id === poId);
    if (!po || po.status !== "approved") return;

    const pendingBase = (po.baseAmount || po.totalAmount) - po.invoicedAmount;
    if (pendingBase > 0 && !confirm(`Esta PO tiene ${formatCurrency(pendingBase)} € sin facturar. ¿Cerrarla?`)) return;

    setProcessing(true);
    try {
      await updateDoc(doc(db, `projects/${id}/pos`, poId), {
        status: "closed",
        closedAt: Timestamp.now(),
        closedBy: userId,
        closedByName: auth.currentUser?.displayName || auth.currentUser?.email || "Usuario",
      });
      await loadData();
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setProcessing(false);
    }
  };

  const handleCancelPO = (po: PO) => {
    if ((po.status !== "approved" && po.status !== "draft") || po.invoicedAmount > 0) return;
    setSelectedPO(po);
    setShowCancelModal(true);
  };

  const confirmCancelPO = async () => {
    if (!selectedPO || !cancellationReason.trim()) return;

    setProcessing(true);
    try {
      if (selectedPO.status === "approved") {
        for (const item of selectedPO.items) {
          if (item.subAccountId) {
            const itemBaseAmount = item.baseAmount || item.quantity * item.unitPrice || 0;
            const accountsSnap = await getDocs(collection(db, `projects/${id}/accounts`));

            for (const accountDoc of accountsSnap.docs) {
              try {
                const subAccountRef = doc(db, `projects/${id}/accounts/${accountDoc.id}/subaccounts`, item.subAccountId);
                const subAccountSnap = await getDoc(subAccountRef);

                if (subAccountSnap.exists()) {
                  await updateDoc(subAccountRef, { committed: Math.max(0, (subAccountSnap.data().committed || 0) - itemBaseAmount) });
                  break;
                }
              } catch (e) {
                continue;
              }
            }
          }
        }
      }

      await updateDoc(doc(db, `projects/${id}/pos`, selectedPO.id), {
        status: "cancelled",
        cancelledAt: Timestamp.now(),
        cancelledBy: userId,
        cancelledByName: auth.currentUser?.displayName || auth.currentUser?.email || "Usuario",
        cancellationReason: cancellationReason.trim(),
        committedAmount: 0,
      });

      await loadData();
      setShowCancelModal(false);
      setSelectedPO(null);
      setCancellationReason("");
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setProcessing(false);
    }
  };

  const handleModifyPO = (po: PO) => {
    if (po.status !== "approved") return;
    setSelectedPO(po);
    setModificationReason("");
    setShowModifyModal(true);
  };

  const confirmModifyPO = async () => {
    if (!selectedPO || !modificationReason.trim()) return;

    setProcessing(true);
    try {
      const newVersion = (selectedPO.version || 1) + 1;
      const existingHistory = (selectedPO.modificationHistory || []).map((m) => ({ ...m, date: Timestamp.fromDate(m.date) }));

      await updateDoc(doc(db, `projects/${id}/pos`, selectedPO.id), {
        version: newVersion,
        status: "draft",
        modificationHistory: [...existingHistory, { date: Timestamp.now(), userId: userId || "", userName: auth.currentUser?.displayName || "Usuario", reason: modificationReason.trim(), previousVersion: selectedPO.version || 1 }],
        approvedAt: null,
        approvedBy: null,
        approvedByName: null,
        approvalSteps: null,
        currentApprovalStep: null,
      });

      router.push(`/project/${id}/accounting/pos/${selectedPO.id}/edit`);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setProcessing(false);
    }
  };

  const handleDeleteDraft = async (poId: string) => {
    const po = pos.find((p) => p.id === poId);
    if (!po || po.status !== "draft" || !confirm(`¿Eliminar PO-${po.number}?`)) return;

    setProcessing(true);
    try {
      await deleteDoc(doc(db, `projects/${id}/pos`, poId));
      await loadData();
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setProcessing(false);
    }
  };

  const openDetailModal = async (po: PO) => {
    setSelectedPO(po);
    setShowDetailModal(true);
    await loadLinkedInvoices(po.id);
  };

  if (loading) {
    return (
      <div className={`flex flex-col min-h-screen bg-white ${inter.className}`}>
        <main className="pt-28 pb-16 px-6 md:px-12 flex-grow flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-slate-200 border-t-slate-700 rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-slate-600 text-sm">Cargando...</p>
          </div>
        </main>
      </div>
    );
  }

  const totalBase = pos.reduce((sum, po) => sum + (po.status === "approved" || po.status === "closed" ? (po.baseAmount || po.totalAmount) : 0), 0);

  return (
    <div className={`flex flex-col min-h-screen bg-white ${inter.className}`}>
      {/* Hero Header */}
      <div className="mt-[4rem] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-10">
          <div className="flex items-center justify-between mb-2">
            <Link href={`/project/${id}/accounting`} className="text-slate-400 hover:text-white transition-colors text-sm flex items-center gap-1">
              <Folder size={14} />
              {projectName}
              <ChevronRight size={14} />
              <span>Contabilidad</span>
            </Link>
            <button onClick={loadData} className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white/80 hover:text-white rounded-lg text-sm transition-colors border border-white/10">
              <RefreshCw size={14} />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white/10 backdrop-blur rounded-xl flex items-center justify-center">
                <FileText size={24} className="text-white" />
              </div>
              <div>
                <h1 className={`text-3xl font-semibold tracking-tight ${spaceGrotesk.className}`}>Órdenes de compra</h1>
                <p className="text-slate-400 text-sm">Gestión de purchase orders</p>
              </div>
            </div>
            <Link href={`/project/${id}/accounting/pos/new`} className="flex items-center gap-2 px-5 py-2.5 bg-white text-slate-900 rounded-xl font-medium transition-all hover:bg-slate-100 shadow-lg">
              <Plus size={18} />
              Nueva PO
            </Link>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-8">
            <div className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <FileText size={18} className="text-blue-400" />
                <span className="text-2xl font-bold">{pos.length}</span>
              </div>
              <p className="text-sm text-slate-400">Total POs</p>
            </div>
            <div className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <Edit size={18} className="text-slate-400" />
                <span className="text-2xl font-bold">{pos.filter((p) => p.status === "draft").length}</span>
              </div>
              <p className="text-sm text-slate-400">Borradores</p>
            </div>
            <div className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <Clock size={18} className="text-amber-400" />
                <span className="text-2xl font-bold">{pos.filter((p) => p.status === "pending").length}</span>
              </div>
              <p className="text-sm text-slate-400">Pendientes</p>
            </div>
            <div className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <CheckCircle size={18} className="text-emerald-400" />
                <span className="text-2xl font-bold">{pos.filter((p) => p.status === "approved").length}</span>
              </div>
              <p className="text-sm text-slate-400">Aprobadas</p>
            </div>
            <div className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <DollarSign size={18} className="text-purple-400" />
                <span className="text-lg font-bold">{formatCurrency(totalBase)} €</span>
              </div>
              <p className="text-sm text-slate-400">Total comprometido</p>
            </div>
          </div>
        </div>
      </div>

      <main className="pb-16 px-6 md:px-12 flex-grow -mt-6">
        <div className="max-w-7xl mx-auto">
          {/* Filters */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-6 shadow-sm">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                <input type="text" placeholder="Buscar por número, proveedor o descripción..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500 bg-slate-50" />
              </div>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500 bg-slate-50">
                <option value="all">Todos los estados</option>
                <option value="draft">Borradores</option>
                <option value="pending">Pendientes</option>
                <option value="approved">Aprobadas</option>
                <option value="closed">Cerradas</option>
                <option value="cancelled">Anuladas</option>
              </select>
            </div>
          </div>

          {/* Table */}
          {filteredPOs.length === 0 ? (
            <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl p-12 text-center">
              <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <FileText size={32} className="text-slate-400" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-2">{searchTerm || statusFilter !== "all" ? "No se encontraron POs" : "No hay órdenes de compra"}</h3>
              <p className="text-slate-500 mb-6">{searchTerm || statusFilter !== "all" ? "Intenta ajustar los filtros" : "Comienza creando tu primera orden de compra"}</p>
              {!searchTerm && statusFilter === "all" && (
                <Link href={`/project/${id}/accounting/pos/new`} className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-medium">
                  <Plus size={18} />
                  Crear primera PO
                </Link>
              )}
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Número</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Proveedor</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Descripción</th>
                      <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Base</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Estado</th>
                      <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase w-40">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredPOs.map((po) => (
                      <tr key={po.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4">
                          <p className="font-semibold text-slate-900">
                            PO-{po.number}
                            {po.version > 1 && <span className="ml-2 text-xs text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">V{String(po.version).padStart(2, "0")}</span>}
                          </p>
                          <p className="text-xs text-slate-500">{formatDate(po.createdAt)}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm font-medium text-slate-900">{po.supplier}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-slate-600 line-clamp-1">{po.generalDescription || po.description}</p>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <p className="text-sm font-bold text-slate-900">{formatCurrency(po.baseAmount || po.totalAmount)} €</p>
                          {po.status === "approved" && po.invoicedAmount > 0 && <p className="text-xs text-emerald-600">Realizado: {formatCurrency(po.invoicedAmount)} €</p>}
                        </td>
                        <td className="px-6 py-4">{getStatusBadge(po.status)}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => openDetailModal(po)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
                              <Eye size={16} />
                            </button>
                            <button onClick={() => generatePDF(po)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
                              <Download size={16} />
                            </button>
                            {po.status === "draft" && (
                              <button onClick={() => router.push(`/project/${id}/accounting/pos/${po.id}/edit`)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
                                <Edit size={16} />
                              </button>
                            )}
                            {po.status === "approved" && (
                              <>
                                <button onClick={() => router.push(`/project/${id}/accounting/invoices/new?poId=${po.id}`)} className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors">
                                  <Receipt size={16} />
                                </button>
                                <button onClick={() => handleModifyPO(po)} disabled={processing} className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors disabled:opacity-50">
                                  <FileEdit size={16} />
                                </button>
                                <button onClick={() => handleClosePO(po.id)} disabled={processing} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50">
                                  <CheckCircle size={16} />
                                </button>
                              </>
                            )}
                            {(po.status === "approved" || po.status === "draft") && po.invoicedAmount === 0 && (
                              <button onClick={() => handleCancelPO(po)} disabled={processing} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50">
                                <XCircle size={16} />
                              </button>
                            )}
                            {po.status === "draft" && (
                              <button onClick={() => handleDeleteDraft(po.id)} disabled={processing} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50">
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Detail Modal */}
      {showDetailModal && selectedPO && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="bg-slate-900 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">
                PO-{selectedPO.number}
                {selectedPO.version > 1 && <span className="ml-2 text-sm bg-white/20 px-2 py-0.5 rounded">V{String(selectedPO.version).padStart(2, "0")}</span>}
              </h2>
              <div className="flex items-center gap-2">
                <button onClick={() => generatePDF(selectedPO)} className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm transition-colors">
                  <Download size={14} />
                  PDF
                </button>
                {selectedPO.status === "approved" && (
                  <button onClick={() => router.push(`/project/${id}/accounting/invoices/new?poId=${selectedPO.id}`)} className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm transition-colors">
                    <Receipt size={14} />
                    Factura
                  </button>
                )}
                <button onClick={() => setShowDetailModal(false)} className="text-white/60 hover:text-white p-2 hover:bg-white/10 rounded-lg transition-colors">
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
              <div className="grid grid-cols-2 gap-6 mb-6">
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Proveedor</p>
                  <p className="text-sm font-semibold text-slate-900">{selectedPO.supplier}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Importes</p>
                  <p className="text-sm font-bold text-slate-900">Base: {formatCurrency(selectedPO.baseAmount || selectedPO.totalAmount)} €</p>
                  <p className="text-xs text-slate-500">Total: {formatCurrency(selectedPO.totalAmount)} €</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Fecha</p>
                  <p className="text-sm text-slate-900">{formatDate(selectedPO.createdAt)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Estado</p>
                  {getStatusBadge(selectedPO.status)}
                </div>
              </div>

              {(selectedPO.status === "approved" || selectedPO.status === "closed") && (
                <div className="mb-6 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                  <p className="text-xs font-semibold text-slate-700 uppercase mb-3">Control presupuestario</p>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Comprometido</p>
                      <p className="text-sm font-bold text-amber-600">{formatCurrency(selectedPO.committedAmount)} €</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Realizado</p>
                      <p className="text-sm font-bold text-emerald-600">{formatCurrency(selectedPO.invoicedAmount)} €</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Pendiente</p>
                      <p className="text-sm font-bold text-blue-600">{formatCurrency(selectedPO.remainingAmount)} €</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="mb-6">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Descripción</p>
                <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded-xl">{selectedPO.generalDescription || selectedPO.description}</p>
              </div>

              <div className="mb-6">
                <p className="text-xs font-semibold text-slate-700 uppercase mb-3">Items ({selectedPO.items?.length || 0})</p>
                <div className="space-y-2">
                  {(selectedPO.items || []).map((item, index) => (
                    <div key={index} className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-slate-900">{item.description}</p>
                          <p className="text-xs text-slate-500 mt-1">
                            {item.subAccountCode || "-"} • {item.quantity} × {formatCurrency(item.unitPrice)} €
                          </p>
                        </div>
                        <p className="text-sm font-bold text-slate-900">{formatCurrency(item.baseAmount || item.quantity * item.unitPrice)} €</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Linked Invoices */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-slate-700 uppercase flex items-center gap-2">
                    <Receipt size={14} />
                    Facturas vinculadas
                  </p>
                </div>
                {loadingInvoices ? (
                  <div className="p-4 bg-slate-50 rounded-xl text-center">
                    <p className="text-sm text-slate-500">Cargando...</p>
                  </div>
                ) : linkedInvoices.length === 0 ? (
                  <div className="p-4 bg-slate-50 rounded-xl border border-dashed border-slate-300 text-center">
                    <p className="text-sm text-slate-500">No hay facturas vinculadas</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {linkedInvoices.map((invoice) => (
                      <div key={invoice.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between hover:bg-slate-100 cursor-pointer transition-colors" onClick={() => router.push(`/project/${id}/accounting/invoices/${invoice.id}`)}>
                        <div>
                          <p className="text-sm font-medium text-slate-900">FAC-{invoice.number}</p>
                          <p className="text-xs text-slate-500">{formatDate(invoice.createdAt)}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <p className="text-sm font-bold text-slate-900">{formatCurrency(invoice.baseAmount)} €</p>
                          {getInvoiceStatusBadge(invoice.status)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Modification History */}
              {selectedPO.modificationHistory && selectedPO.modificationHistory.length > 0 && (
                <div className="mb-6">
                  <p className="text-xs font-semibold text-slate-700 uppercase mb-3 flex items-center gap-2">
                    <History size={14} />
                    Historial de modificaciones
                  </p>
                  <div className="space-y-2">
                    {selectedPO.modificationHistory.map((mod, index) => (
                      <div key={index} className="p-3 bg-purple-50 rounded-xl border border-purple-200">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-sm font-medium text-purple-900">
                              V{String(mod.previousVersion).padStart(2, "0")} → V{String(mod.previousVersion + 1).padStart(2, "0")}
                            </p>
                            <p className="text-xs text-purple-700 mt-1">{mod.reason}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-purple-600">{formatDate(mod.date)}</p>
                            <p className="text-xs text-purple-500">{mod.userName}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedPO.status === "cancelled" && selectedPO.cancellationReason && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                  <p className="text-xs font-semibold text-red-800 uppercase mb-2">Motivo de anulación</p>
                  <p className="text-sm text-red-700">{selectedPO.cancellationReason}</p>
                  <p className="text-xs text-red-600 mt-2">Anulada por {selectedPO.cancelledByName} el {selectedPO.cancelledAt && formatDate(selectedPO.cancelledAt)}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {showCancelModal && selectedPO && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
            <div className="bg-slate-900 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <h3 className="text-lg font-semibold text-white">Anular PO-{selectedPO.number}</h3>
              <button onClick={() => { setShowCancelModal(false); setSelectedPO(null); setCancellationReason(""); }} className="text-white/60 hover:text-white p-2 hover:bg-white/10 rounded-lg transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="p-6">
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 mb-2">Motivo de anulación *</label>
                <textarea value={cancellationReason} onChange={(e) => setCancellationReason(e.target.value)} placeholder="Explica por qué se anula esta PO..." rows={4} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500 resize-none bg-slate-50" />
                {selectedPO.status === "approved" && <p className="text-xs text-slate-500 mt-2">Se liberará el presupuesto comprometido ({formatCurrency(selectedPO.committedAmount)} €)</p>}
              </div>

              <div className="flex gap-3">
                <button onClick={() => { setShowCancelModal(false); setSelectedPO(null); setCancellationReason(""); }} className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 font-medium transition-colors">
                  Cancelar
                </button>
                <button onClick={confirmCancelPO} disabled={processing || !cancellationReason.trim()} className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50">
                  {processing ? "Anulando..." : "Confirmar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modify Modal */}
      {showModifyModal && selectedPO && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
            <div className="bg-slate-900 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <h3 className="text-lg font-semibold text-white">Modificar PO-{selectedPO.number}</h3>
              <button onClick={() => { setShowModifyModal(false); setSelectedPO(null); setModificationReason(""); }} className="text-white/60 hover:text-white p-2 hover:bg-white/10 rounded-lg transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="p-6">
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-amber-800">
                    <p className="font-medium">Pasará a V{String((selectedPO.version || 1) + 1).padStart(2, "0")} en borrador</p>
                    <p className="text-xs mt-1">Deberás editarla y enviarla nuevamente para aprobación.</p>
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 mb-2">Motivo de la modificación *</label>
                <textarea value={modificationReason} onChange={(e) => setModificationReason(e.target.value)} placeholder="Explica por qué se modifica esta PO..." rows={4} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500 resize-none bg-slate-50" />
              </div>

              <div className="flex gap-3">
                <button onClick={() => { setShowModifyModal(false); setSelectedPO(null); setModificationReason(""); }} className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 font-medium transition-colors">
                  Cancelar
                </button>
                <button onClick={confirmModifyPO} disabled={processing || !modificationReason.trim()} className="flex-1 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-medium transition-colors disabled:opacity-50">
                  {processing ? "Modificando..." : "Modificar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
