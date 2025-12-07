"use client";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Inter } from "next/font/google";
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
  where,
  Timestamp,
} from "firebase/firestore";
import {
  FileText,
  ArrowLeft,
  Download,
  Edit,
  Trash2,
  X,
  FileEdit,
  Receipt,
  History,
  AlertTriangle,
  MoreHorizontal,
  Lock,
  Unlock,
  XCircle,
  Building2,
  Calendar,
  User,
  Tag,
  CreditCard,
  FileUp,
  ExternalLink,
  CheckCircle,
  Clock,
  AlertCircle,
} from "lucide-react";
import jsPDF from "jspdf";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

type POStatus = "draft" | "pending" | "approved" | "closed" | "cancelled";

interface POItem {
  id?: string;
  description: string;
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

interface POItemWithInvoiced extends POItem {
  invoicedAmount: number;
  pendingAmount: number;
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
  items?: any[];
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
  attachmentFileName?: string;
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

const PO_TYPE_LABELS: Record<string, string> = {
  rental: "Alquiler",
  purchase: "Compra",
  service: "Servicio",
  deposit: "Fianza",
};

export default function PODetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params?.id as string;
  const poId = params?.poId as string;

  const [loading, setLoading] = useState(true);
  const [projectName, setProjectName] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState("");
  const [po, setPo] = useState<PO | null>(null);

  const [linkedInvoices, setLinkedInvoices] = useState<LinkedInvoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [itemsWithInvoiced, setItemsWithInvoiced] = useState<POItemWithInvoiced[]>([]);

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showModifyModal, setShowModifyModal] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");
  const [modificationReason, setModificationReason] = useState("");
  const [processing, setProcessing] = useState(false);

  const [openMenu, setOpenMenu] = useState(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        setUserId(user.uid);
        setUserName(user.displayName || user.email || "Usuario");
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (projectId && poId) loadData();
  }, [projectId, poId]);

  useEffect(() => {
    const handleClickOutside = () => setOpenMenu(false);
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      const projectDoc = await getDoc(doc(db, "projects", projectId));
      if (projectDoc.exists()) {
        setProjectName(projectDoc.data().name || "Proyecto");
      }

      const poDoc = await getDoc(doc(db, `projects/${projectId}/pos`, poId));
      if (!poDoc.exists()) {
        router.push(`/project/${projectId}/accounting/pos`);
        return;
      }

      const poData = {
        id: poDoc.id,
        ...poDoc.data(),
        createdAt: poDoc.data().createdAt?.toDate(),
        approvedAt: poDoc.data().approvedAt?.toDate(),
        closedAt: poDoc.data().closedAt?.toDate(),
        cancelledAt: poDoc.data().cancelledAt?.toDate(),
        version: poDoc.data().version || 1,
        committedAmount: poDoc.data().committedAmount || 0,
        invoicedAmount: poDoc.data().invoicedAmount || 0,
        remainingAmount: poDoc.data().remainingAmount || 0,
        items: (poDoc.data().items || []).map((item: any, idx: number) => ({
          ...item,
          id: item.id || `item-${idx}`,
        })),
        modificationHistory: (poDoc.data().modificationHistory || []).map((m: any) => ({
          ...m,
          date: m.date?.toDate() || new Date(),
        })),
      } as PO;

      setPo(poData);
      await loadLinkedInvoicesAndItems(poData);
    } catch (error) {
      console.error("Error cargando PO:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadLinkedInvoicesAndItems = async (poData: PO) => {
    setLoadingInvoices(true);
    try {
      const invoicesSnap = await getDocs(
        query(collection(db, `projects/${projectId}/invoices`), where("poId", "==", poData.id))
      );

      const invoices: LinkedInvoice[] = invoicesSnap.docs.map((doc) => ({
        id: doc.id,
        number: doc.data().number,
        totalAmount: doc.data().totalAmount || 0,
        baseAmount: doc.data().baseAmount || doc.data().totalAmount || 0,
        status: doc.data().status,
        createdAt: doc.data().createdAt?.toDate() || new Date(),
        items: doc.data().items || [],
      }));

      setLinkedInvoices(invoices);

      // Calculate invoiced amount per PO item
      const invoicedByItem: Record<string, number> = {};
      invoices.forEach((invoice) => {
        if (["pending", "pending_approval", "approved", "paid", "overdue"].includes(invoice.status)) {
          (invoice.items || []).forEach((invItem: any) => {
            const key = invItem.poItemId || (invItem.poItemIndex !== undefined ? `index-${invItem.poItemIndex}` : null);
            if (key) {
              invoicedByItem[key] = (invoicedByItem[key] || 0) + (invItem.totalAmount || 0);
            }
          });
        }
      });

      const itemsTracked: POItemWithInvoiced[] = poData.items.map((item, idx) => {
        const key = item.id || `index-${idx}`;
        const invoicedAmount = invoicedByItem[key] || 0;
        const itemTotal = item.totalAmount || item.baseAmount || item.quantity * item.unitPrice || 0;
        return {
          ...item,
          id: item.id || `item-${idx}`,
          invoicedAmount,
          pendingAmount: itemTotal - invoicedAmount,
        };
      });

      setItemsWithInvoiced(itemsTracked);
    } catch (error) {
      console.error("Error cargando facturas:", error);
      setLinkedInvoices([]);
      setItemsWithInvoiced([]);
    } finally {
      setLoadingInvoices(false);
    }
  };

  const formatCurrency = (amount: number): string =>
    new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount || 0);

  const formatDate = (date: Date) =>
    date ? new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", year: "numeric" }).format(date) : "-";

  const formatDateTime = (date: Date) =>
    date
      ? new Intl.DateTimeFormat("es-ES", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }).format(date)
      : "-";

  const getStatusConfig = (status: POStatus) => {
    const config: Record<POStatus, { bg: string; text: string; label: string; icon: any }> = {
      draft: { bg: "bg-slate-100", text: "text-slate-700", label: "Borrador", icon: FileText },
      pending: { bg: "bg-amber-50", text: "text-amber-700", label: "Pendiente de aprobación", icon: Clock },
      approved: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Aprobada", icon: CheckCircle },
      closed: { bg: "bg-blue-50", text: "text-blue-700", label: "Cerrada", icon: Lock },
      cancelled: { bg: "bg-red-50", text: "text-red-700", label: "Anulada", icon: XCircle },
    };
    return config[status];
  };

  const getInvoiceStatusBadge = (status: string) => {
    const config: Record<string, { bg: string; text: string; label: string }> = {
      pending_approval: { bg: "bg-amber-50", text: "text-amber-700", label: "Pte. aprobación" },
      pending: { bg: "bg-blue-50", text: "text-blue-700", label: "Pte. pago" },
      approved: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Aprobada" },
      paid: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Pagada" },
      cancelled: { bg: "bg-red-50", text: "text-red-700", label: "Anulada" },
      rejected: { bg: "bg-red-50", text: "text-red-700", label: "Rechazada" },
    };
    const c = config[status] || { bg: "bg-slate-100", text: "text-slate-700", label: status };
    return <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${c.bg} ${c.text}`}>{c.label}</span>;
  };

  // === ACTIONS ===

  const handleEditDraft = () => {
    router.push(`/project/${projectId}/accounting/pos/${poId}/edit`);
  };

  const handleCreateInvoice = () => {
    router.push(`/project/${projectId}/accounting/invoices/new?poId=${poId}`);
  };

  const handleClosePO = async () => {
    if (!po || po.status !== "approved") return;
    setOpenMenu(false);

    const pendingBase = (po.baseAmount || po.totalAmount) - po.invoicedAmount;
    if (pendingBase > 0 && !confirm(`Esta PO tiene ${formatCurrency(pendingBase)} € sin facturar. ¿Cerrarla igualmente?`)) return;

    setProcessing(true);
    try {
      await updateDoc(doc(db, `projects/${projectId}/pos`, poId), {
        status: "closed",
        closedAt: Timestamp.now(),
        closedBy: userId,
        closedByName: userName,
      });
      await loadData();
    } catch (error) {
      console.error("Error:", error);
      alert("Error al cerrar la PO");
    } finally {
      setProcessing(false);
    }
  };

  const handleReopenPO = async () => {
    if (!po || po.status !== "closed") return;
    setOpenMenu(false);

    if (!confirm("¿Reabrir esta PO? Volverá al estado 'Aprobada'.")) return;

    setProcessing(true);
    try {
      await updateDoc(doc(db, `projects/${projectId}/pos`, poId), {
        status: "approved",
        closedAt: null,
        closedBy: null,
        closedByName: null,
      });
      await loadData();
    } catch (error) {
      console.error("Error:", error);
      alert("Error al reabrir la PO");
    } finally {
      setProcessing(false);
    }
  };

  const handleCancelPO = () => {
    if (!po || (po.status !== "approved" && po.status !== "draft") || po.invoicedAmount > 0) return;
    setShowCancelModal(true);
    setOpenMenu(false);
  };

  const confirmCancelPO = async () => {
    if (!po || !cancellationReason.trim()) return;

    setProcessing(true);
    try {
      if (po.status === "approved") {
        for (const item of po.items) {
          if (item.subAccountId) {
            const itemBaseAmount = item.baseAmount || item.quantity * item.unitPrice || 0;
            const accountsSnap = await getDocs(collection(db, `projects/${projectId}/accounts`));

            for (const accountDoc of accountsSnap.docs) {
              try {
                const subAccountRef = doc(db, `projects/${projectId}/accounts/${accountDoc.id}/subaccounts`, item.subAccountId);
                const subAccountSnap = await getDoc(subAccountRef);
                if (subAccountSnap.exists()) {
                  await updateDoc(subAccountRef, {
                    committed: Math.max(0, (subAccountSnap.data().committed || 0) - itemBaseAmount),
                  });
                  break;
                }
              } catch (e) {
                continue;
              }
            }
          }
        }
      }

      await updateDoc(doc(db, `projects/${projectId}/pos`, poId), {
        status: "cancelled",
        cancelledAt: Timestamp.now(),
        cancelledBy: userId,
        cancelledByName: userName,
        cancellationReason: cancellationReason.trim(),
        committedAmount: 0,
      });

      setShowCancelModal(false);
      setCancellationReason("");
      await loadData();
    } catch (error) {
      console.error("Error:", error);
      alert("Error al anular la PO");
    } finally {
      setProcessing(false);
    }
  };

  const handleModifyPO = () => {
    if (!po || po.status !== "approved") return;
    setModificationReason("");
    setShowModifyModal(true);
    setOpenMenu(false);
  };

  const confirmModifyPO = async () => {
    if (!po || !modificationReason.trim()) return;

    setProcessing(true);
    try {
      const newVersion = (po.version || 1) + 1;
      const existingHistory = (po.modificationHistory || []).map((m) => ({
        ...m,
        date: Timestamp.fromDate(m.date),
      }));

      await updateDoc(doc(db, `projects/${projectId}/pos`, poId), {
        version: newVersion,
        status: "draft",
        modificationHistory: [
          ...existingHistory,
          {
            date: Timestamp.now(),
            userId: userId || "",
            userName: userName,
            reason: modificationReason.trim(),
            previousVersion: po.version || 1,
          },
        ],
        approvedAt: null,
        approvedBy: null,
        approvedByName: null,
        approvalSteps: null,
        currentApprovalStep: null,
      });

      setShowModifyModal(false);
      router.push(`/project/${projectId}/accounting/pos/${poId}/edit`);
    } catch (error) {
      console.error("Error:", error);
      alert("Error al modificar la PO");
    } finally {
      setProcessing(false);
    }
  };

  const handleDeleteDraft = async () => {
    if (!po || po.status !== "draft") return;
    setOpenMenu(false);

    if (!confirm(`¿Eliminar PO-${po.number}? Esta acción no se puede deshacer.`)) return;

    setProcessing(true);
    try {
      await deleteDoc(doc(db, `projects/${projectId}/pos`, poId));
      router.push(`/project/${projectId}/accounting/pos`);
    } catch (error) {
      console.error("Error:", error);
      alert("Error al eliminar la PO");
    } finally {
      setProcessing(false);
    }
  };

  const generatePDF = () => {
    if (!po) return;

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

    // Header
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

    const statusText =
      po.status === "draft" ? "BORRADOR" :
      po.status === "pending" ? "PENDIENTE" :
      po.status === "approved" ? "APROBADA" :
      po.status === "closed" ? "CERRADA" :
      po.status === "cancelled" ? "ANULADA" : po.status.toUpperCase();

    const statusColor: [number, number, number] =
      po.status === "approved" ? successColor :
      po.status === "pending" ? warningColor :
      po.status === "draft" ? secondaryColor : [239, 68, 68];

    pdf.setFillColor(...statusColor);
    const statusWidth = pdf.getTextWidth(statusText) + 16;
    pdf.roundedRect(pageWidth - margin - statusWidth, 12, statusWidth, 10, 2, 2, "F");
    pdf.setFontSize(10);
    pdf.text(statusText, pageWidth - margin - statusWidth + 8, 19);
    pdf.setFont("helvetica", "normal");
    pdf.text(projectName, pageWidth - margin - pdf.getTextWidth(projectName), 35);

    y = 55;
    const boxWidth = (pageWidth - margin * 2 - 10) / 2;

    // Supplier & Base
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

    // Date boxes
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

    // Description
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

    // Items table
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
      pdf.text(item.subAccountCode || "-", margin + 85, y + 8);
      pdf.setTextColor(30, 41, 59);
      pdf.text(String(item.quantity || 0), margin + 115, y + 8);
      pdf.text(`${formatCurrency(item.unitPrice || 0)}`, margin + 130, y + 8);
      pdf.setFont("helvetica", "bold");
      const itemBase = item.baseAmount || item.quantity * item.unitPrice || 0;
      pdf.text(`${formatCurrency(itemBase)} €`, pageWidth - margin - 25, y + 8);
      y += 12;
    });

    // Totals
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

    // Footer
    const footerY = pageHeight - 15;
    pdf.setDrawColor(226, 232, 240);
    pdf.setLineWidth(0.3);
    pdf.line(margin, footerY - 8, pageWidth - margin, footerY - 8);
    pdf.setTextColor(...secondaryColor);
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "normal");
    pdf.text(`Generado el ${formatDateTime(new Date())}`, margin, footerY);

    pdf.save(`PO-${po.number}${po.version > 1 ? `-V${String(po.version).padStart(2, "0")}` : ""}.pdf`);
  };

  if (loading) {
    return (
      <div className={`min-h-screen bg-slate-50 flex items-center justify-center ${inter.className}`}>
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-slate-200 border-t-slate-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-500 text-sm">Cargando orden de compra...</p>
        </div>
      </div>
    );
  }

  if (!po) {
    return (
      <div className={`min-h-screen bg-slate-50 flex items-center justify-center ${inter.className}`}>
        <div className="text-center">
          <AlertCircle size={48} className="text-slate-300 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-slate-900 mb-2">PO no encontrada</h2>
          <Link href={`/project/${projectId}/accounting/pos`} className="text-indigo-600 hover:underline text-sm">
            Volver a órdenes de compra
          </Link>
        </div>
      </div>
    );
  }

  const statusConfig = getStatusConfig(po.status);
  const StatusIcon = statusConfig.icon;

  return (
    <div className={`min-h-screen bg-slate-50 ${inter.className}`}>
      {/* Header */}
      <div className="mt-16 border-b border-slate-200 bg-white">
        <div className="max-w-5xl mx-auto px-6 py-6">
          <Link
            href={`/project/${projectId}/accounting/pos`}
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4"
          >
            <ArrowLeft size={14} />
            Volver a órdenes de compra
          </Link>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center">
                <FileText size={24} className="text-indigo-600" />
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-semibold text-slate-900">PO-{po.number}</h1>
                  {po.version > 1 && (
                    <span className="text-sm bg-purple-50 text-purple-700 px-2 py-0.5 rounded font-medium">
                      V{String(po.version).padStart(2, "0")}
                    </span>
                  )}
                  <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${statusConfig.bg} ${statusConfig.text} flex items-center gap-1.5`}>
                    <StatusIcon size={12} />
                    {statusConfig.label}
                  </span>
                </div>
                <p className="text-sm text-slate-500 mt-0.5">{po.supplier}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={generatePDF}
                className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 text-sm font-medium transition-colors"
              >
                <Download size={16} />
                PDF
              </button>

              {/* Actions dropdown */}
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenMenu(!openMenu);
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 text-sm font-medium transition-colors"
                >
                  Acciones
                  <MoreHorizontal size={16} />
                </button>

                {openMenu && (
                  <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-lg z-20 py-1 overflow-hidden">
                    {po.status === "draft" && (
                      <>
                        <button
                          onClick={handleEditDraft}
                          className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3"
                        >
                          <Edit size={15} className="text-slate-400" />
                          Editar borrador
                        </button>
                        <button
                          onClick={handleDeleteDraft}
                          className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-3"
                        >
                          <Trash2 size={15} />
                          Eliminar
                        </button>
                      </>
                    )}

                    {po.status === "approved" && (
                      <>
                        <button
                          onClick={handleCreateInvoice}
                          className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3"
                        >
                          <Receipt size={15} className="text-slate-400" />
                          Crear factura
                        </button>
                        <button
                          onClick={handleModifyPO}
                          className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3"
                        >
                          <FileEdit size={15} className="text-slate-400" />
                          Modificar PO
                        </button>
                        <button
                          onClick={handleClosePO}
                          className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3"
                        >
                          <Lock size={15} className="text-slate-400" />
                          Cerrar PO
                        </button>
                        {po.invoicedAmount === 0 && (
                          <button
                            onClick={handleCancelPO}
                            className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-3"
                          >
                            <XCircle size={15} />
                            Anular PO
                          </button>
                        )}
                      </>
                    )}

                    {po.status === "closed" && (
                      <button
                        onClick={handleReopenPO}
                        className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3"
                      >
                        <Unlock size={15} className="text-slate-400" />
                        Reabrir PO
                      </button>
                    )}

                    {(po.status === "pending" || po.status === "cancelled") && (
                      <p className="px-4 py-2.5 text-sm text-slate-400">Sin acciones disponibles</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Cancelled Warning */}
            {po.status === "cancelled" && po.cancellationReason && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <XCircle size={18} className="text-red-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-red-800">PO Anulada</p>
                    <p className="text-sm text-red-700 mt-1">{po.cancellationReason}</p>
                    <p className="text-xs text-red-600 mt-2">
                      Anulada por {po.cancelledByName} el {formatDate(po.cancelledAt!)}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Description */}
            {(po.generalDescription || po.description) && (
              <div className="bg-white border border-slate-200 rounded-xl p-6">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Descripción</p>
                <p className="text-sm text-slate-700 leading-relaxed">
                  {po.generalDescription || po.description}
                </p>
              </div>
            )}

            {/* Budget Control */}
            {(po.status === "approved" || po.status === "closed") && (
              <div className="bg-white border border-slate-200 rounded-xl p-6">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-4">Control presupuestario</p>
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-amber-50 rounded-lg p-4">
                    <p className="text-xs text-amber-600 mb-1">Comprometido</p>
                    <p className="text-lg font-bold text-amber-700">{formatCurrency(po.committedAmount)} €</p>
                  </div>
                  <div className="bg-emerald-50 rounded-lg p-4">
                    <p className="text-xs text-emerald-600 mb-1">Facturado</p>
                    <p className="text-lg font-bold text-emerald-700">{formatCurrency(po.invoicedAmount)} €</p>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-4">
                    <p className="text-xs text-blue-600 mb-1">Pendiente</p>
                    <p className="text-lg font-bold text-blue-700">{formatCurrency(po.remainingAmount)} €</p>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                    <span>Progreso de facturación</span>
                    <span>{((po.invoicedAmount / (po.baseAmount || po.totalAmount)) * 100).toFixed(0)}%</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 transition-all"
                      style={{ width: `${Math.min((po.invoicedAmount / (po.baseAmount || po.totalAmount)) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Items */}
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-4">
                Items ({po.items?.length || 0})
              </p>

              {loadingInvoices ? (
                <div className="text-center py-8 text-slate-500 text-sm">
                  Cargando información de facturación...
                </div>
              ) : (
                <div className="space-y-4">
                  {itemsWithInvoiced.map((item, index) => {
                    const itemTotal = item.totalAmount || item.baseAmount || item.quantity * item.unitPrice || 0;
                    const percentInvoiced = itemTotal > 0 ? (item.invoicedAmount / itemTotal) * 100 : 0;
                    const isOverInvoiced = item.invoicedAmount > itemTotal;

                    return (
                      <div key={item.id || index} className="border border-slate-200 rounded-lg p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <p className="font-medium text-slate-900">{item.description}</p>
                            <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                              {item.subAccountCode && (
                                <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded">
                                  {item.subAccountCode}
                                </span>
                              )}
                              <span>{item.quantity} × {formatCurrency(item.unitPrice)} €</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-slate-900">{formatCurrency(itemTotal)} €</p>
                            {item.vatRate !== undefined && item.vatRate > 0 && (
                              <p className="text-xs text-slate-500">IVA {item.vatRate}%</p>
                            )}
                          </div>
                        </div>

                        {/* Invoice tracking per item */}
                        {(po.status === "approved" || po.status === "closed") && (
                          <div className="pt-3 border-t border-slate-100">
                            <div className="flex items-center justify-between text-xs mb-2">
                              <span className="text-slate-500">Facturado</span>
                              <span className={`font-medium ${isOverInvoiced ? "text-red-600" : "text-emerald-600"}`}>
                                {formatCurrency(item.invoicedAmount)} € ({percentInvoiced.toFixed(0)}%)
                              </span>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                              <div
                                className={`h-full transition-all ${
                                  isOverInvoiced ? "bg-red-500" : percentInvoiced > 90 ? "bg-amber-500" : "bg-emerald-500"
                                }`}
                                style={{ width: `${Math.min(percentInvoiced, 100)}%` }}
                              />
                            </div>
                            <div className="flex items-center justify-between text-xs mt-2">
                              <span className="text-slate-500">Pendiente</span>
                              <span className={`font-medium ${item.pendingAmount < 0 ? "text-red-600" : "text-slate-700"}`}>
                                {formatCurrency(item.pendingAmount)} €
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Linked Invoices */}
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs text-slate-500 uppercase tracking-wider">
                  Facturas vinculadas ({linkedInvoices.length})
                </p>
                {po.status === "approved" && (
                  <button
                    onClick={handleCreateInvoice}
                    className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                  >
                    + Nueva factura
                  </button>
                )}
              </div>

              {loadingInvoices ? (
                <div className="text-center py-8 text-slate-500 text-sm">Cargando...</div>
              ) : linkedInvoices.length === 0 ? (
                <div className="border-2 border-dashed border-slate-200 rounded-lg p-8 text-center">
                  <Receipt size={32} className="text-slate-300 mx-auto mb-3" />
                  <p className="text-sm text-slate-500 mb-3">No hay facturas vinculadas</p>
                  {po.status === "approved" && (
                    <button
                      onClick={handleCreateInvoice}
                      className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                    >
                      Crear primera factura
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {linkedInvoices.map((invoice) => (
                    <Link
                      key={invoice.id}
                      href={`/project/${projectId}/accounting/invoices/${invoice.id}`}
                      className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
                          <Receipt size={16} className="text-emerald-600" />
                        </div>
                        <div>
                          <p className="font-medium text-slate-900 group-hover:text-indigo-600 transition-colors">
                            FAC-{invoice.number}
                          </p>
                          <p className="text-xs text-slate-500">{formatDate(invoice.createdAt)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <p className="font-semibold text-slate-900">{formatCurrency(invoice.totalAmount)} €</p>
                        {getInvoiceStatusBadge(invoice.status)}
                        <ExternalLink size={14} className="text-slate-400 group-hover:text-indigo-600" />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Modification History */}
            {po.modificationHistory && po.modificationHistory.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl p-6">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <History size={14} />
                  Historial de modificaciones
                </p>
                <div className="space-y-3">
                  {po.modificationHistory.map((mod, index) => (
                    <div key={index} className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium text-purple-900">
                            V{String(mod.previousVersion).padStart(2, "0")} → V{String(mod.previousVersion + 1).padStart(2, "0")}
                          </p>
                          <p className="text-sm text-purple-700 mt-1">{mod.reason}</p>
                        </div>
                        <div className="text-right text-xs">
                          <p className="text-purple-600">{formatDate(mod.date)}</p>
                          <p className="text-purple-500">{mod.userName}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            {/* Totals */}
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-4">Resumen</p>

              <div className="space-y-3 mb-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-500">Base imponible</span>
                  <span className="font-medium text-slate-900">{formatCurrency(po.baseAmount || po.totalAmount)} €</span>
                </div>
                {(po.vatAmount ?? 0) > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-500">IVA</span>
                    <span className="font-medium text-emerald-600">+{formatCurrency(po.vatAmount || 0)} €</span>
                  </div>
                )}
                {(po.irpfAmount ?? 0) > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-500">IRPF</span>
                    <span className="font-medium text-red-600">-{formatCurrency(po.irpfAmount || 0)} €</span>
                  </div>
                )}
              </div>

              <div className="border-t border-slate-200 pt-4">
                <div className="flex justify-between items-center">
                  <span className="text-base font-semibold text-slate-900">Total</span>
                  <span className="text-2xl font-bold text-slate-900">{formatCurrency(po.totalAmount)} €</span>
                </div>
              </div>
            </div>

            {/* Details */}
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-4">Detalles</p>

              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <Building2 size={16} className="text-slate-400 mt-0.5" />
                  <div>
                    <p className="text-xs text-slate-500">Proveedor</p>
                    <p className="text-sm font-medium text-slate-900">{po.supplier}</p>
                  </div>
                </div>

                {po.department && (
                  <div className="flex items-start gap-3">
                    <Tag size={16} className="text-slate-400 mt-0.5" />
                    <div>
                      <p className="text-xs text-slate-500">Departamento</p>
                      <p className="text-sm font-medium text-slate-900">{po.department}</p>
                    </div>
                  </div>
                )}

                {po.poType && (
                  <div className="flex items-start gap-3">
                    <FileText size={16} className="text-slate-400 mt-0.5" />
                    <div>
                      <p className="text-xs text-slate-500">Tipo</p>
                      <p className="text-sm font-medium text-slate-900">{PO_TYPE_LABELS[po.poType] || po.poType}</p>
                    </div>
                  </div>
                )}

                {po.paymentTerms && (
                  <div className="flex items-start gap-3">
                    <CreditCard size={16} className="text-slate-400 mt-0.5" />
                    <div>
                      <p className="text-xs text-slate-500">Condiciones de pago</p>
                      <p className="text-sm font-medium text-slate-900">{po.paymentTerms}</p>
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-3">
                  <Calendar size={16} className="text-slate-400 mt-0.5" />
                  <div>
                    <p className="text-xs text-slate-500">Fecha de creación</p>
                    <p className="text-sm font-medium text-slate-900">{formatDate(po.createdAt)}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <User size={16} className="text-slate-400 mt-0.5" />
                  <div>
                    <p className="text-xs text-slate-500">Creado por</p>
                    <p className="text-sm font-medium text-slate-900">{po.createdByName}</p>
                  </div>
                </div>

                {po.approvedAt && (
                  <div className="flex items-start gap-3">
                    <CheckCircle size={16} className="text-emerald-500 mt-0.5" />
                    <div>
                      <p className="text-xs text-slate-500">Aprobada</p>
                      <p className="text-sm font-medium text-slate-900">
                        {formatDate(po.approvedAt)} por {po.approvedByName}
                      </p>
                    </div>
                  </div>
                )}

                {po.closedAt && (
                  <div className="flex items-start gap-3">
                    <Lock size={16} className="text-blue-500 mt-0.5" />
                    <div>
                      <p className="text-xs text-slate-500">Cerrada</p>
                      <p className="text-sm font-medium text-slate-900">
                        {formatDate(po.closedAt)} por {po.closedByName}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Attachment */}
            {po.attachmentUrl && (
              <div className="bg-white border border-slate-200 rounded-xl p-6">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-4">Adjunto</p>
                <a
                  href={po.attachmentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors"
                >
                  <FileUp size={20} className="text-slate-500" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {po.attachmentFileName || "Documento adjunto"}
                    </p>
                    <p className="text-xs text-slate-500">Clic para abrir</p>
                  </div>
                  <ExternalLink size={14} className="text-slate-400" />
                </a>
              </div>
            )}

            {/* Notes */}
            {po.notes && (
              <div className="bg-white border border-slate-200 rounded-xl p-6">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Notas internas</p>
                <p className="text-sm text-slate-700">{po.notes}</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Cancel Modal */}
      {showCancelModal && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => {
            setShowCancelModal(false);
            setCancellationReason("");
          }}
        >
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900">Anular PO-{po.number}</h3>
            </div>
            <div className="p-6">
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 mb-2">Motivo de anulación *</label>
                <textarea
                  value={cancellationReason}
                  onChange={(e) => setCancellationReason(e.target.value)}
                  placeholder="Explica por qué se anula esta PO..."
                  rows={4}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 resize-none bg-white text-sm"
                />
                {po.status === "approved" && (
                  <p className="text-xs text-slate-500 mt-2">
                    Se liberará el presupuesto comprometido ({formatCurrency(po.committedAmount)} €)
                  </p>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowCancelModal(false);
                    setCancellationReason("");
                  }}
                  className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 text-sm font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmCancelPO}
                  disabled={processing || !cancellationReason.trim()}
                  className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {processing ? "Anulando..." : "Confirmar anulación"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modify Modal */}
      {showModifyModal && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => {
            setShowModifyModal(false);
            setModificationReason("");
          }}
        >
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900">Modificar PO-{po.number}</h3>
            </div>
            <div className="p-6">
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-amber-800">
                    <p className="font-medium">
                      Pasará a V{String((po.version || 1) + 1).padStart(2, "0")} en borrador
                    </p>
                    <p className="text-xs mt-1">
                      Deberás editarla y enviarla nuevamente para aprobación.
                    </p>
                  </div>
                </div>
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Motivo de la modificación *
                </label>
                <textarea
                  value={modificationReason}
                  onChange={(e) => setModificationReason(e.target.value)}
                  placeholder="Explica por qué se modifica esta PO..."
                  rows={4}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 resize-none bg-white text-sm"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowModifyModal(false);
                    setModificationReason("");
                  }}
                  className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 text-sm font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmModifyPO}
                  disabled={processing || !modificationReason.trim()}
                  className="flex-1 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
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
