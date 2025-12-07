"use client";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Inter } from "next/font/google";
import { useState, useEffect, useRef } from "react";
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
  FileText,
  Plus,
  Search,
  Eye,
  Edit,
  Trash2,
  X,
  FileEdit,
  Download,
  Receipt,
  History,
  AlertTriangle,
  ArrowLeft,
  MoreHorizontal,
  Lock,
  Unlock,
  XCircle,
} from "lucide-react";
import jsPDF from "jspdf";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

type POStatus = "draft" | "pending" | "approved" | "closed" | "cancelled";

interface POItem {
  id?: string;
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
  const [userName, setUserName] = useState<string>("");
  const [pos, setPos] = useState<PO[]>([]);
  const [filteredPOs, setFilteredPOs] = useState<PO[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | POStatus>("all");

  // Modals
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedPO, setSelectedPO] = useState<PO | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showModifyModal, setShowModifyModal] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");
  const [modificationReason, setModificationReason] = useState("");
  const [processing, setProcessing] = useState(false);

  // Invoices & Items tracking
  const [linkedInvoices, setLinkedInvoices] = useState<LinkedInvoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [itemsWithInvoiced, setItemsWithInvoiced] = useState<POItemWithInvoiced[]>([]);

  // Menu
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // ============ EFFECTS ============

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
    if (id) loadData();
  }, [id]);

  useEffect(() => {
    filterPOs();
  }, [searchTerm, statusFilter, pos]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ============ DATA LOADING ============

  const loadData = async () => {
    try {
      setLoading(true);
      const projectDoc = await getDoc(doc(db, "projects", id));
      if (projectDoc.exists()) {
        setProjectName(projectDoc.data().name || "Proyecto");
      }

      const posSnapshot = await getDocs(
        query(collection(db, `projects/${id}/pos`), orderBy("createdAt", "desc"))
      );

      const posData = posSnapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
        createdAt: docSnap.data().createdAt?.toDate(),
        approvedAt: docSnap.data().approvedAt?.toDate(),
        closedAt: docSnap.data().closedAt?.toDate(),
        cancelledAt: docSnap.data().cancelledAt?.toDate(),
        version: docSnap.data().version || 1,
        committedAmount: docSnap.data().committedAmount || 0,
        invoicedAmount: docSnap.data().invoicedAmount || 0,
        remainingAmount: docSnap.data().remainingAmount || 0,
        items: (docSnap.data().items || []).map((item: any, idx: number) => ({
          ...item,
          id: item.id || `item-${idx}`,
        })),
        modificationHistory: (docSnap.data().modificationHistory || []).map((m: any) => ({
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

  const loadLinkedInvoicesAndItems = async (po: PO) => {
    setLoadingInvoices(true);
    try {
      const invoicesSnap = await getDocs(
        query(collection(db, `projects/${id}/invoices`), where("poId", "==", po.id))
      );

      const invoices: LinkedInvoice[] = invoicesSnap.docs.map((docSnap) => ({
        id: docSnap.id,
        number: docSnap.data().number,
        totalAmount: docSnap.data().totalAmount || 0,
        baseAmount: docSnap.data().baseAmount || docSnap.data().totalAmount || 0,
        status: docSnap.data().status,
        createdAt: docSnap.data().createdAt?.toDate() || new Date(),
        items: docSnap.data().items || [],
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

      // Create items with invoiced tracking
      const itemsTracked: POItemWithInvoiced[] = po.items.map((item, idx) => {
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

  // ============ FILTERING ============

  const filterPOs = () => {
    let filtered = [...pos];

    if (searchTerm) {
      filtered = filtered.filter(
        (po) =>
          po.number.toLowerCase().includes(searchTerm.toLowerCase()) ||
          po.supplier.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (po.generalDescription || po.description || "")
            .toLowerCase()
            .includes(searchTerm.toLowerCase())
      );
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((po) => po.status === statusFilter);
    }

    setFilteredPOs(filtered);
  };

  // ============ FORMATTING ============

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat("es-ES", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount || 0);
  };

  const formatDate = (date: Date) => {
    if (!date) return "-";
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(date);
  };

  const formatDateTime = (date: Date) => {
    if (!date) return "-";
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  // ============ STATUS BADGES ============

  const getStatusBadge = (status: POStatus) => {
    const config: Record<POStatus, { bg: string; text: string; label: string }> = {
      draft: { bg: "bg-slate-100", text: "text-slate-700", label: "Borrador" },
      pending: { bg: "bg-amber-50", text: "text-amber-700", label: "Pendiente" },
      approved: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Aprobada" },
      closed: { bg: "bg-blue-50", text: "text-blue-700", label: "Cerrada" },
      cancelled: { bg: "bg-red-50", text: "text-red-700", label: "Anulada" },
    };
    const c = config[status];
    return (
      <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${c.bg} ${c.text}`}>
        {c.label}
      </span>
    );
  };

  const getInvoiceStatusBadge = (status: string) => {
    const config: Record<string, { bg: string; text: string; label: string }> = {
      pending_approval: { bg: "bg-amber-50", text: "text-amber-700", label: "Pte. aprobación" },
      pending: { bg: "bg-blue-50", text: "text-blue-700", label: "Pte. pago" },
      paid: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Pagada" },
      cancelled: { bg: "bg-red-50", text: "text-red-700", label: "Anulada" },
      rejected: { bg: "bg-red-50", text: "text-red-700", label: "Rechazada" },
    };
    const c = config[status] || { bg: "bg-slate-100", text: "text-slate-700", label: status };
    return (
      <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${c.bg} ${c.text}`}>
        {c.label}
      </span>
    );
  };

  // ============ ACTIONS ============

  const openDetailModal = async (po: PO) => {
    setSelectedPO(po);
    setShowDetailModal(true);
    setOpenMenuId(null);
    await loadLinkedInvoicesAndItems(po);
  };

  const handleEditDraft = (po: PO) => {
    setOpenMenuId(null);
    router.push(`/project/${id}/accounting/pos/${po.id}/edit`);
  };

  const handleCreateInvoice = (po: PO) => {
    setOpenMenuId(null);
    router.push(`/project/${id}/accounting/invoices/new?poId=${po.id}`);
  };

  const handleClosePO = async (po: PO) => {
    if (po.status !== "approved") return;
    setOpenMenuId(null);

    const pendingBase = (po.baseAmount || po.totalAmount) - po.invoicedAmount;
    if (pendingBase > 0 && !confirm(`Esta PO tiene ${formatCurrency(pendingBase)} € sin facturar. ¿Cerrarla igualmente?`)) {
      return;
    }

    setProcessing(true);
    try {
      await updateDoc(doc(db, `projects/${id}/pos`, po.id), {
        status: "closed",
        closedAt: Timestamp.now(),
        closedBy: userId,
        closedByName: userName,
      });
      await loadData();
      if (showDetailModal && selectedPO?.id === po.id) {
        setSelectedPO({ ...po, status: "closed" });
      }
    } catch (error) {
      console.error("Error:", error);
      alert("Error al cerrar la PO");
    } finally {
      setProcessing(false);
    }
  };

  const handleReopenPO = async (po: PO) => {
    if (po.status !== "closed") return;
    setOpenMenuId(null);

    if (!confirm("¿Reabrir esta PO? Volverá al estado 'Aprobada'.")) return;

    setProcessing(true);
    try {
      await updateDoc(doc(db, `projects/${id}/pos`, po.id), {
        status: "approved",
        closedAt: null,
        closedBy: null,
        closedByName: null,
      });
      await loadData();
      if (showDetailModal && selectedPO?.id === po.id) {
        setSelectedPO({ ...po, status: "approved" });
      }
    } catch (error) {
      console.error("Error:", error);
      alert("Error al reabrir la PO");
    } finally {
      setProcessing(false);
    }
  };

  const handleCancelPO = (po: PO) => {
    if ((po.status !== "approved" && po.status !== "draft") || po.invoicedAmount > 0) return;
    setSelectedPO(po);
    setShowCancelModal(true);
    setOpenMenuId(null);
  };

  const confirmCancelPO = async () => {
    if (!selectedPO || !cancellationReason.trim()) return;

    setProcessing(true);
    try {
      // If approved, release committed budget
      if (selectedPO.status === "approved") {
        for (const item of selectedPO.items) {
          if (item.subAccountId) {
            const itemBaseAmount = item.baseAmount || item.quantity * item.unitPrice || 0;
            const accountsSnap = await getDocs(collection(db, `projects/${id}/accounts`));

            for (const accountDoc of accountsSnap.docs) {
              try {
                const subAccountRef = doc(
                  db,
                  `projects/${id}/accounts/${accountDoc.id}/subaccounts`,
                  item.subAccountId
                );
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

      await updateDoc(doc(db, `projects/${id}/pos`, selectedPO.id), {
        status: "cancelled",
        cancelledAt: Timestamp.now(),
        cancelledBy: userId,
        cancelledByName: userName,
        cancellationReason: cancellationReason.trim(),
        committedAmount: 0,
      });

      await loadData();
      setShowCancelModal(false);
      setShowDetailModal(false);
      setSelectedPO(null);
      setCancellationReason("");
    } catch (error) {
      console.error("Error:", error);
      alert("Error al anular la PO");
    } finally {
      setProcessing(false);
    }
  };

  const handleModifyPO = (po: PO) => {
    if (po.status !== "approved") return;
    setSelectedPO(po);
    setModificationReason("");
    setShowModifyModal(true);
    setOpenMenuId(null);
  };

  const confirmModifyPO = async () => {
    if (!selectedPO || !modificationReason.trim()) return;

    setProcessing(true);
    try {
      const newVersion = (selectedPO.version || 1) + 1;
      const existingHistory = (selectedPO.modificationHistory || []).map((m) => ({
        ...m,
        date: Timestamp.fromDate(m.date),
      }));

      await updateDoc(doc(db, `projects/${id}/pos`, selectedPO.id), {
        version: newVersion,
        status: "draft",
        modificationHistory: [
          ...existingHistory,
          {
            date: Timestamp.now(),
            userId: userId || "",
            userName: userName,
            reason: modificationReason.trim(),
            previousVersion: selectedPO.version || 1,
          },
        ],
        approvedAt: null,
        approvedBy: null,
        approvedByName: null,
        approvalSteps: null,
        currentApprovalStep: null,
      });

      setShowModifyModal(false);
      setShowDetailModal(false);
      router.push(`/project/${id}/accounting/pos/${selectedPO.id}/edit`);
    } catch (error) {
      console.error("Error:", error);
      alert("Error al modificar la PO");
    } finally {
      setProcessing(false);
    }
  };

  const handleDeleteDraft = async (po: PO) => {
    if (po.status !== "draft") return;
    setOpenMenuId(null);

    if (!confirm(`¿Eliminar PO-${po.number}? Esta acción no se puede deshacer.`)) return;

    setProcessing(true);
    try {
      await deleteDoc(doc(db, `projects/${id}/pos`, po.id));
      await loadData();
      if (showDetailModal && selectedPO?.id === po.id) {
        setShowDetailModal(false);
        setSelectedPO(null);
      }
    } catch (error) {
      console.error("Error:", error);
      alert("Error al eliminar la PO");
    } finally {
      setProcessing(false);
    }
  };

  // ============ PDF GENERATION ============

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

    const drawRoundedRect = (
      x: number,
      y: number,
      w: number,
      h: number,
      r: number,
      color: [number, number, number]
    ) => {
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
    pdf.text("PO-" + po.number, margin, 35);

    if (po.version > 1) {
      pdf.setFontSize(12);
      pdf.text("V" + String(po.version).padStart(2, "0"), margin + pdf.getTextWidth("PO-" + po.number) + 5, 35);
    }

    const statusText =
      po.status === "draft"
        ? "BORRADOR"
        : po.status === "pending"
        ? "PENDIENTE"
        : po.status === "approved"
        ? "APROBADA"
        : po.status === "closed"
        ? "CERRADA"
        : po.status === "cancelled"
        ? "ANULADA"
        : po.status.toUpperCase();

    const statusColor: [number, number, number] =
      po.status === "approved"
        ? successColor
        : po.status === "pending"
        ? warningColor
        : po.status === "draft"
        ? secondaryColor
        : [239, 68, 68];

    pdf.setFillColor(...statusColor);
    const statusWidth = pdf.getTextWidth(statusText) + 16;
    pdf.roundedRect(pageWidth - margin - statusWidth, 12, statusWidth, 10, 2, 2, "F");
    pdf.setFontSize(10);
    pdf.text(statusText, pageWidth - margin - statusWidth + 8, 19);
    pdf.setFont("helvetica", "normal");
    pdf.text(projectName, pageWidth - margin - pdf.getTextWidth(projectName), 35);

    y = 55;
    const boxWidth = (pageWidth - margin * 2 - 10) / 2;

    // Supplier box
    drawRoundedRect(margin, y, boxWidth, 35, 3, lightBg);
    pdf.setTextColor(...primaryColor);
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "bold");
    pdf.text("PROVEEDOR", margin + 5, y + 8);
    pdf.setTextColor(30, 41, 59);
    pdf.setFontSize(12);
    pdf.text(po.supplier, margin + 5, y + 18);

    // Base amount box
    drawRoundedRect(margin + boxWidth + 10, y, boxWidth, 35, 3, lightBg);
    pdf.setTextColor(...primaryColor);
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "bold");
    pdf.text("BASE IMPONIBLE", margin + boxWidth + 15, y + 8);
    pdf.setTextColor(30, 41, 59);
    pdf.setFontSize(18);
    pdf.text(formatCurrency(po.baseAmount || po.totalAmount) + " €", margin + boxWidth + 15, y + 20);
    pdf.setFontSize(9);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(...secondaryColor);
    pdf.text("Total: " + formatCurrency(po.totalAmount) + " €", margin + boxWidth + 15, y + 28);

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
    pdf.text("V" + String(po.version).padStart(2, "0"), margin + (dateBoxWidth + 10) * 2 + 5, y + 17);

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

    // Items header
    pdf.setTextColor(...primaryColor);
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "bold");
    pdf.text("LÍNEAS (" + (po.items?.length || 0) + ")", margin, y);
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

    // Items
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

      const descText =
        (item.description || "").substring(0, 40) +
        ((item.description || "").length > 40 ? "..." : "");
      pdf.text(descText, margin + 5, y + 8);

      pdf.setFontSize(8);
      pdf.setTextColor(...secondaryColor);
      pdf.text(item.subAccountCode || item.budgetAccount || "-", margin + 85, y + 8);

      pdf.setTextColor(30, 41, 59);
      pdf.text(String(item.quantity || 0), margin + 115, y + 8);
      pdf.text(formatCurrency(item.unitPrice || 0), margin + 130, y + 8);

      pdf.setFont("helvetica", "bold");
      const itemBase = item.baseAmount || item.quantity * item.unitPrice || 0;
      pdf.text(formatCurrency(itemBase) + " €", pageWidth - margin - 25, y + 8);

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
    pdf.text(formatCurrency(po.baseAmount || po.totalAmount) + " €", totalsX + 45, y + 10);

    if (po.vatAmount && po.vatAmount > 0) {
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(...secondaryColor);
      pdf.text("IVA:", totalsX - 5, y + 18);
      pdf.setTextColor(30, 41, 59);
      pdf.text(formatCurrency(po.vatAmount) + " €", totalsX + 45, y + 18);
    }

    if (po.irpfAmount && po.irpfAmount > 0) {
      pdf.setTextColor(...secondaryColor);
      pdf.text("IRPF:", totalsX - 5, y + 26);
      pdf.setTextColor(30, 41, 59);
      pdf.text("-" + formatCurrency(po.irpfAmount) + " €", totalsX + 45, y + 26);
    }

    pdf.setDrawColor(...primaryColor);
    pdf.setLineWidth(0.5);
    pdf.line(totalsX - 5, y + 32, totalsX + 65, y + 32);

    pdf.setTextColor(...primaryColor);
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "bold");
    pdf.text("TOTAL:", totalsX - 5, y + 40);
    pdf.text(formatCurrency(po.totalAmount) + " €", totalsX + 45, y + 40);

    // Footer
    const footerY = pageHeight - 15;
    pdf.setDrawColor(226, 232, 240);
    pdf.setLineWidth(0.3);
    pdf.line(margin, footerY - 8, pageWidth - margin, footerY - 8);

    pdf.setTextColor(...secondaryColor);
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "normal");
    pdf.text("Generado el " + formatDateTime(new Date()), margin, footerY);

    pdf.save(
      "PO-" + po.number + (po.version > 1 ? "-V" + String(po.version).padStart(2, "0") : "") + ".pdf"
    );
  };

  // ============ CONTEXT MENU ============

  const renderContextMenu = (po: PO) => {
    if (openMenuId !== po.id) return null;

    return (
      <div
        ref={menuRef}
        className="absolute right-0 top-full mt-1 w-48 bg-white border border-slate-200 rounded-xl shadow-lg z-20 py-1 overflow-hidden"
      >
        {/* Always show: View & Download */}
        <button
          onClick={() => openDetailModal(po)}
          className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3"
        >
          <Eye size={15} className="text-slate-400" />
          Ver detalles
        </button>
        <button
          onClick={() => {
            generatePDF(po);
            setOpenMenuId(null);
          }}
          className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3"
        >
          <Download size={15} className="text-slate-400" />
          Descargar PDF
        </button>

        {/* Draft actions */}
        {po.status === "draft" && (
          <>
            <div className="border-t border-slate-100 my-1" />
            <button
              onClick={() => handleEditDraft(po)}
              className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3"
            >
              <Edit size={15} className="text-slate-400" />
              Editar borrador
            </button>
            <button
              onClick={() => handleDeleteDraft(po)}
              className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-3"
            >
              <Trash2 size={15} />
              Eliminar
            </button>
          </>
        )}

        {/* Approved actions */}
        {po.status === "approved" && (
          <>
            <div className="border-t border-slate-100 my-1" />
            <button
              onClick={() => handleCreateInvoice(po)}
              className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3"
            >
              <Receipt size={15} className="text-slate-400" />
              Crear factura
            </button>
            <button
              onClick={() => handleModifyPO(po)}
              className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3"
            >
              <FileEdit size={15} className="text-slate-400" />
              Modificar PO
            </button>
            <button
              onClick={() => handleClosePO(po)}
              className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3"
            >
              <Lock size={15} className="text-slate-400" />
              Cerrar PO
            </button>
            {po.invoicedAmount === 0 && (
              <button
                onClick={() => handleCancelPO(po)}
                className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-3"
              >
                <XCircle size={15} />
                Anular PO
              </button>
            )}
          </>
        )}

        {/* Closed actions */}
        {po.status === "closed" && (
          <>
            <div className="border-t border-slate-100 my-1" />
            <button
              onClick={() => handleReopenPO(po)}
              className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3"
            >
              <Unlock size={15} className="text-slate-400" />
              Reabrir PO
            </button>
          </>
        )}
      </div>
    );
  };

  // ============ RENDER ============

  if (loading) {
    return (
      <div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}>
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-slate-200 border-t-slate-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-500 text-sm">Cargando órdenes de compra...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-white ${inter.className}`}>
      {/* Header */}
      <div className="mt-16 border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-6 py-6">
          <Link
            href={`/project/${id}/accounting`}
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4"
          >
            <ArrowLeft size={14} />
            Volver al Panel
          </Link>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                <FileText size={20} className="text-indigo-600" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-slate-900">Órdenes de compra</h1>
                <p className="text-sm text-slate-500">
                  {pos.length} {pos.length === 1 ? "orden" : "órdenes"}
                </p>
              </div>
            </div>

            <Link
              href={`/project/${id}/accounting/pos/new`}
              className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors"
            >
              <Plus size={16} />
              Nueva PO
            </Link>
          </div>
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-6 py-6">
        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="flex-1 relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              placeholder="Buscar por número, proveedor..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 bg-white text-sm"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 bg-white text-sm"
          >
            <option value="all">Todos los estados</option>
            <option value="draft">Borradores</option>
            <option value="pending">Pendientes</option>
            <option value="approved">Aprobadas</option>
            <option value="closed">Cerradas</option>
            <option value="cancelled">Anuladas</option>
          </select>
        </div>

        {/* Table or Empty State */}
        {filteredPOs.length === 0 ? (
          <div className="border-2 border-dashed border-slate-200 rounded-xl p-12 text-center">
            <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <FileText size={24} className="text-indigo-600" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-1">
              {searchTerm || statusFilter !== "all"
                ? "No se encontraron POs"
                : "No hay órdenes de compra"}
            </h3>
            <p className="text-slate-500 text-sm mb-4">
              {searchTerm || statusFilter !== "all"
                ? "Intenta ajustar los filtros"
                : "Comienza creando tu primera orden de compra"}
            </p>
            {!searchTerm && statusFilter === "all" && (
              <Link
                href={`/project/${id}/accounting/pos/new`}
                className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800"
              >
                <Plus size={16} />
                Crear primera PO
              </Link>
            )}
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">
                    Número
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">
                    Proveedor
                  </th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-slate-500 uppercase">
                    Base
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">
                    Estado
                  </th>
                  <th className="w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPOs.map((po) => (
                  <tr key={po.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <button
                        onClick={() => openDetailModal(po)}
                        className="text-left hover:text-indigo-600 transition-colors"
                      >
                        <p className="font-medium text-slate-900">
                          PO-{po.number}
                          {po.version > 1 && (
                            <span className="ml-2 text-xs text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">
                              V{String(po.version).padStart(2, "0")}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-slate-500">{formatDate(po.createdAt)}</p>
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-slate-900">{po.supplier}</p>
                      <p className="text-xs text-slate-500 line-clamp-1">
                        {po.generalDescription || po.description}
                      </p>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <p className="text-sm font-semibold text-slate-900">
                        {formatCurrency(po.baseAmount || po.totalAmount)} €
                      </p>
                      {po.status === "approved" && po.invoicedAmount > 0 && (
                        <p className="text-xs text-emerald-600">
                          Fact: {formatCurrency(po.invoicedAmount)} €
                        </p>
                      )}
                    </td>
                    <td className="px-6 py-4">{getStatusBadge(po.status)}</td>
                    <td className="px-6 py-4">
                      <div className="relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuId(openMenuId === po.id ? null : po.id);
                          }}
                          className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                          <MoreHorizontal size={18} />
                        </button>
                        {renderContextMenu(po)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* Detail Modal */}
      {showDetailModal && selectedPO && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowDetailModal(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  PO-{selectedPO.number}
                  {selectedPO.version > 1 && (
                    <span className="ml-2 text-sm bg-purple-50 text-purple-700 px-2 py-0.5 rounded">
                      V{String(selectedPO.version).padStart(2, "0")}
                    </span>
                  )}
                </h2>
                <p className="text-sm text-slate-500">{selectedPO.supplier}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => generatePDF(selectedPO)}
                  className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                  title="Descargar PDF"
                >
                  <Download size={18} />
                </button>
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
              {/* Stats */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-slate-50 rounded-lg p-4">
                  <p className="text-xs text-slate-500 mb-1">Base imponible</p>
                  <p className="text-lg font-bold text-slate-900">
                    {formatCurrency(selectedPO.baseAmount || selectedPO.totalAmount)} €
                  </p>
                </div>
                <div className="bg-slate-50 rounded-lg p-4">
                  <p className="text-xs text-slate-500 mb-1">Total</p>
                  <p className="text-lg font-bold text-slate-900">
                    {formatCurrency(selectedPO.totalAmount)} €
                  </p>
                </div>
                <div className="bg-slate-50 rounded-lg p-4">
                  <p className="text-xs text-slate-500 mb-1">Estado</p>
                  <div className="mt-1">{getStatusBadge(selectedPO.status)}</div>
                </div>
              </div>

              {/* Budget Control (for approved/closed) */}
              {(selectedPO.status === "approved" || selectedPO.status === "closed") && (
                <div className="mb-6 p-4 bg-slate-50 border border-slate-200 rounded-lg">
                  <p className="text-xs font-medium text-slate-700 uppercase mb-3">
                    Control presupuestario
                  </p>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Comprometido</p>
                      <p className="text-sm font-semibold text-amber-600">
                        {formatCurrency(selectedPO.committedAmount)} €
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Facturado</p>
                      <p className="text-sm font-semibold text-emerald-600">
                        {formatCurrency(selectedPO.invoicedAmount)} €
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Pendiente</p>
                      <p className="text-sm font-semibold text-blue-600">
                        {formatCurrency(selectedPO.remainingAmount)} €
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Description */}
              {(selectedPO.generalDescription || selectedPO.description) && (
                <div className="mb-6">
                  <p className="text-xs text-slate-500 uppercase mb-2">Descripción</p>
                  <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded-lg">
                    {selectedPO.generalDescription || selectedPO.description}
                  </p>
                </div>
              )}

              {/* Items with tracking */}
              <div className="mb-6">
                <p className="text-xs font-medium text-slate-700 uppercase mb-3">
                  Items ({selectedPO.items?.length || 0})
                </p>
                {loadingInvoices ? (
                  <div className="text-center py-4 text-slate-500 text-sm">
                    Cargando información de facturación...
                  </div>
                ) : (
                  <div className="space-y-3">
                    {itemsWithInvoiced.map((item, index) => {
                      const itemTotal =
                        item.totalAmount || item.baseAmount || item.quantity * item.unitPrice || 0;
                      const percentInvoiced =
                        itemTotal > 0 ? (item.invoicedAmount / itemTotal) * 100 : 0;
                      const isOverInvoiced = item.invoicedAmount > itemTotal;

                      return (
                        <div
                          key={item.id || index}
                          className="p-4 bg-slate-50 rounded-lg border border-slate-200"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <p className="text-sm font-medium text-slate-900">
                                {item.description}
                              </p>
                              <p className="text-xs text-slate-500 mt-1">
                                {item.subAccountCode || "-"} · {item.quantity} ×{" "}
                                {formatCurrency(item.unitPrice)} €
                              </p>
                            </div>
                            <p className="text-sm font-semibold text-slate-900">
                              {formatCurrency(itemTotal)} €
                            </p>
                          </div>

                          {/* Invoice tracking per item */}
                          {(selectedPO.status === "approved" ||
                            selectedPO.status === "closed") && (
                            <div className="mt-3 pt-3 border-t border-slate-200">
                              <div className="flex items-center justify-between text-xs mb-2">
                                <span className="text-slate-500">Facturado</span>
                                <span
                                  className={`font-medium ${
                                    isOverInvoiced ? "text-red-600" : "text-emerald-600"
                                  }`}
                                >
                                  {formatCurrency(item.invoicedAmount)} € (
                                  {percentInvoiced.toFixed(0)}%)
                                </span>
                              </div>
                              <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                                <div
                                  className={`h-full transition-all ${
                                    isOverInvoiced
                                      ? "bg-red-500"
                                      : percentInvoiced > 90
                                      ? "bg-amber-500"
                                      : "bg-emerald-500"
                                  }`}
                                  style={{ width: `${Math.min(percentInvoiced, 100)}%` }}
                                />
                              </div>
                              <div className="flex items-center justify-between text-xs mt-2">
                                <span className="text-slate-500">Pendiente</span>
                                <span
                                  className={`font-medium ${
                                    item.pendingAmount < 0 ? "text-red-600" : "text-slate-700"
                                  }`}
                                >
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
              <div className="mb-6">
                <p className="text-xs font-medium text-slate-700 uppercase mb-3">
                  Facturas vinculadas
                </p>
                {loadingInvoices ? (
                  <div className="p-4 bg-slate-50 rounded-lg text-center">
                    <p className="text-sm text-slate-500">Cargando...</p>
                  </div>
                ) : linkedInvoices.length === 0 ? (
                  <div className="p-4 bg-slate-50 rounded-lg border border-dashed border-slate-300 text-center">
                    <p className="text-sm text-slate-500">No hay facturas vinculadas</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {linkedInvoices.map((invoice) => (
                      <div
                        key={invoice.id}
                        className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between hover:bg-slate-100 cursor-pointer transition-colors"
                        onClick={() =>
                          router.push(`/project/${id}/accounting/invoices/${invoice.id}`)
                        }
                      >
                        <div>
                          <p className="text-sm font-medium text-slate-900">
                            FAC-{invoice.number}
                          </p>
                          <p className="text-xs text-slate-500">{formatDate(invoice.createdAt)}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <p className="text-sm font-semibold text-slate-900">
                            {formatCurrency(invoice.totalAmount)} €
                          </p>
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
                  <p className="text-xs font-medium text-slate-700 uppercase mb-3 flex items-center gap-2">
                    <History size={14} />
                    Historial de modificaciones
                  </p>
                  <div className="space-y-2">
                    {selectedPO.modificationHistory.map((mod, index) => (
                      <div
                        key={index}
                        className="p-3 bg-purple-50 rounded-lg border border-purple-200"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-sm font-medium text-purple-900">
                              V{String(mod.previousVersion).padStart(2, "0")} → V
                              {String(mod.previousVersion + 1).padStart(2, "0")}
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

              {/* Cancellation info */}
              {selectedPO.status === "cancelled" && selectedPO.cancellationReason && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-xs font-medium text-red-800 uppercase mb-2">
                    Motivo de anulación
                  </p>
                  <p className="text-sm text-red-700">{selectedPO.cancellationReason}</p>
                  <p className="text-xs text-red-600 mt-2">
                    Anulada por {selectedPO.cancelledByName} el{" "}
                    {selectedPO.cancelledAt && formatDate(selectedPO.cancelledAt)}
                  </p>
                </div>
              )}
            </div>

            {/* Modal Footer - Quick Actions */}
            {(selectedPO.status === "draft" ||
              selectedPO.status === "approved" ||
              selectedPO.status === "closed") && (
              <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
                {selectedPO.status === "draft" && (
                  <>
                    <button
                      onClick={() => handleDeleteDraft(selectedPO)}
                      className="px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      Eliminar
                    </button>
                    <button
                      onClick={() => handleEditDraft(selectedPO)}
                      className="px-4 py-2 text-sm bg-slate-900 text-white hover:bg-slate-800 rounded-lg transition-colors"
                    >
                      Editar borrador
                    </button>
                  </>
                )}
                {selectedPO.status === "approved" && (
                  <>
                    {selectedPO.invoicedAmount === 0 && (
                      <button
                        onClick={() => handleCancelPO(selectedPO)}
                        className="px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        Anular
                      </button>
                    )}
                    <button
                      onClick={() => handleModifyPO(selectedPO)}
                      className="px-4 py-2 text-sm border border-slate-200 text-slate-700 hover:bg-white rounded-lg transition-colors"
                    >
                      Modificar
                    </button>
                    <button
                      onClick={() => handleCreateInvoice(selectedPO)}
                      className="px-4 py-2 text-sm bg-slate-900 text-white hover:bg-slate-800 rounded-lg transition-colors"
                    >
                      Crear factura
                    </button>
                  </>
                )}
                {selectedPO.status === "closed" && (
                  <button
                    onClick={() => handleReopenPO(selectedPO)}
                    className="px-4 py-2 text-sm bg-slate-900 text-white hover:bg-slate-800 rounded-lg transition-colors"
                  >
                    Reabrir PO
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {showCancelModal && selectedPO && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => {
            setShowCancelModal(false);
            setSelectedPO(null);
            setCancellationReason("");
          }}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900">
                Anular PO-{selectedPO.number}
              </h3>
            </div>
            <div className="p-6">
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Motivo de anulación *
                </label>
                <textarea
                  value={cancellationReason}
                  onChange={(e) => setCancellationReason(e.target.value)}
                  placeholder="Explica por qué se anula esta PO..."
                  rows={4}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 resize-none bg-white text-sm"
                />
                {selectedPO.status === "approved" && (
                  <p className="text-xs text-slate-500 mt-2">
                    Se liberará el presupuesto comprometido (
                    {formatCurrency(selectedPO.committedAmount)} €)
                  </p>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowCancelModal(false);
                    setSelectedPO(null);
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
      {showModifyModal && selectedPO && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => {
            setShowModifyModal(false);
            setSelectedPO(null);
            setModificationReason("");
          }}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900">
                Modificar PO-{selectedPO.number}
              </h3>
            </div>
            <div className="p-6">
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-amber-800">
                    <p className="font-medium">
                      Pasará a V{String((selectedPO.version || 1) + 1).padStart(2, "0")} en borrador
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
                    setSelectedPO(null);
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
