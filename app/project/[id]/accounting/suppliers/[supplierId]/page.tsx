"use client";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Inter } from "next/font/google";
import { useState, useEffect } from "react";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, collection, getDocs, updateDoc, deleteDoc, query, where, Timestamp, orderBy } from "firebase/firestore";
import { ArrowLeft, Edit, Trash2, Mail, Phone, User, CreditCard, FileText, AlertCircle, CheckCircle, X, Download, FileSpreadsheet, Send, Copy, ExternalLink, Calendar, Building2, MapPin, ChevronRight, MoreHorizontal } from "lucide-react";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

interface Certificate { expiryDate?: Date; uploaded: boolean; fileName?: string; verified?: boolean; verifiedByName?: string; verifiedAt?: Date; }

interface Supplier {
  id: string;
  fiscalName: string;
  commercialName: string;
  country: string;
  taxId: string;
  address: { street: string; number: string; city: string; province: string; postalCode: string };
  contact: { name: string; email: string; phone: string };
  paymentMethod: string;
  bankAccount: string;
  certificates: { bankOwnership: Certificate; contractorsCertificate: Certificate };
  createdAt: Date;
}

interface Invoice {
  id: string;
  number: string;
  description: string;
  baseAmount: number;
  totalAmount: number;
  status: string;
  issueDate: Date;
  dueDate?: Date;
  paidAt?: Date;
}

interface PO {
  id: string;
  number: string;
  description: string;
  baseAmount: number;
  status: string;
  createdAt: Date;
}

interface ProjectConfig {
  fiscalName: string;
  taxId: string;
  address: string;
  city: string;
  postalCode: string;
}

const COUNTRIES: Record<string, string> = { ES: "España", FR: "Francia", DE: "Alemania", IT: "Italia", PT: "Portugal", UK: "Reino Unido", US: "Estados Unidos" };
const PAYMENT_METHODS: Record<string, string> = { transferencia: "Transferencia", tb30: "Transf. 30 días", tb60: "Transf. 60 días", tarjeta: "Tarjeta", efectivo: "Efectivo" };

export default function SupplierDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params?.id as string;
  const supplierId = params?.supplierId as string;

  const [loading, setLoading] = useState(true);
  const [projectName, setProjectName] = useState("");
  const [projectConfig, setProjectConfig] = useState<ProjectConfig | null>(null);
  const [producerNames, setProducerNames] = useState<string[]>([]);
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [pos, setPos] = useState<PO[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState("");
  const [canVerify, setCanVerify] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        setUserId(user.uid);
        setUserName(user.displayName || user.email || "Usuario");
        try {
          const memberDoc = await getDoc(doc(db, `projects/${projectId}/members`, user.uid));
          if (memberDoc.exists()) setCanVerify(memberDoc.data().accountingAccessLevel === "accounting_extended");
        } catch (e) { console.error(e); }
      }
    });
    return () => unsubscribe();
  }, [projectId]);

  useEffect(() => { if (userId && projectId && supplierId) loadData(); }, [userId, projectId, supplierId]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Cargar proyecto
      const projectDoc = await getDoc(doc(db, "projects", projectId));
      if (projectDoc.exists()) {
        const projectData = projectDoc.data();
        setProjectName(projectData.name || "Proyecto");
        
        // Cargar nombres de productoras
        if (projectData.producers && projectData.producers.length > 0) {
          const producerNamesArr: string[] = [];
          for (const producerId of projectData.producers) {
            const producerDoc = await getDoc(doc(db, "producers", producerId));
            if (producerDoc.exists()) producerNamesArr.push(producerDoc.data().name);
          }
          setProducerNames(producerNamesArr);
        }
      }

      // Cargar config del proyecto (datos fiscales)
      const configDoc = await getDoc(doc(db, `projects/${projectId}/config`, "company"));
      if (configDoc.exists()) {
        const configData = configDoc.data();
        setProjectConfig({
          fiscalName: configData.fiscalName || "",
          taxId: configData.taxId || "",
          address: configData.address || "",
          city: configData.city || "",
          postalCode: configData.postalCode || "",
        });
      }

      // Cargar proveedor
      const supplierDoc = await getDoc(doc(db, `projects/${projectId}/suppliers`, supplierId));
      if (!supplierDoc.exists()) { setLoading(false); return; }

      const data = supplierDoc.data();
      setSupplier({
        id: supplierDoc.id,
        fiscalName: data.fiscalName || "",
        commercialName: data.commercialName || "",
        country: data.country || "ES",
        taxId: data.taxId || "",
        address: data.address || {},
        contact: data.contact || {},
        paymentMethod: data.paymentMethod || "transferencia",
        bankAccount: data.bankAccount || "",
        certificates: {
          bankOwnership: { ...data.certificates?.bankOwnership, expiryDate: data.certificates?.bankOwnership?.expiryDate?.toDate(), verifiedAt: data.certificates?.bankOwnership?.verifiedAt?.toDate() },
          contractorsCertificate: { ...data.certificates?.contractorsCertificate, expiryDate: data.certificates?.contractorsCertificate?.expiryDate?.toDate(), verifiedAt: data.certificates?.contractorsCertificate?.verifiedAt?.toDate() },
        },
        createdAt: data.createdAt?.toDate() || new Date(),
      });

      // Cargar facturas
      const invSnap = await getDocs(query(
        collection(db, `projects/${projectId}/invoices`), 
        where("supplierId", "==", supplierId),
        orderBy("createdAt", "desc")
      ));
      setInvoices(invSnap.docs.map(d => {
        const invData = d.data();
        return {
          id: d.id,
          number: invData.number || "",
          description: invData.description || "",
          baseAmount: invData.baseAmount || 0,
          totalAmount: invData.totalAmount || invData.baseAmount || 0,
          status: invData.status || "pending",
          issueDate: invData.issueDate?.toDate() || invData.createdAt?.toDate() || new Date(),
          dueDate: invData.dueDate?.toDate(),
          paidAt: invData.paidAt?.toDate(),
        };
      }));

      // Cargar POs
      const posSnap = await getDocs(query(
        collection(db, `projects/${projectId}/pos`), 
        where("supplierId", "==", supplierId),
        orderBy("createdAt", "desc")
      ));
      setPos(posSnap.docs.map(d => {
        const poData = d.data();
        return {
          id: d.id,
          number: poData.number || "",
          description: poData.generalDescription || poData.description || "",
          baseAmount: poData.baseAmount || 0,
          status: poData.status || "draft",
          createdAt: poData.createdAt?.toDate() || new Date(),
        };
      }));

    } catch (error: any) {
      setErrorMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (certType: "bankOwnership" | "contractorsCertificate", verified: boolean) => {
    if (!supplier || !canVerify) return;
    try {
      const updates: any = { [`certificates.${certType}.verified`]: verified };
      if (verified) {
        updates[`certificates.${certType}.verifiedBy`] = userId;
        updates[`certificates.${certType}.verifiedByName`] = userName;
        updates[`certificates.${certType}.verifiedAt`] = Timestamp.now();
      } else {
        updates[`certificates.${certType}.verifiedBy`] = null;
        updates[`certificates.${certType}.verifiedByName`] = null;
        updates[`certificates.${certType}.verifiedAt`] = null;
      }
      await updateDoc(doc(db, `projects/${projectId}/suppliers`, supplierId), updates);
      setSuccessMessage(verified ? "Certificado verificado" : "Verificación eliminada");
      setTimeout(() => setSuccessMessage(""), 3000);
      await loadData();
    } catch (e: any) { setErrorMessage(e.message); }
  };

  const handleDelete = async () => {
    if (invoices.length > 0 || pos.length > 0) { setErrorMessage("No se puede eliminar: tiene documentos asociados"); return; }
    if (!confirm(`¿Eliminar a ${supplier?.fiscalName}?`)) return;
    try {
      await deleteDoc(doc(db, `projects/${projectId}/suppliers`, supplierId));
      router.push(`/project/${projectId}/accounting/suppliers`);
    } catch (e: any) { setErrorMessage(e.message); }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setSuccessMessage(`${label} copiado`);
    setTimeout(() => setSuccessMessage(""), 2000);
  };

  const formatIBAN = (iban: string) => iban.replace(/\s/g, "").toUpperCase().match(/.{1,4}/g)?.join(" ") || iban;
  const formatDate = (date?: Date) => date ? new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", year: "numeric" }).format(date) : "-";
  const formatCurrency = (amount: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);

  const getCertStatus = (cert: Certificate) => {
    if (!cert.uploaded) return { label: "No subido", color: "text-red-600", bg: "bg-red-50" };
    if (cert.verified) return { label: "Verificado", color: "text-emerald-600", bg: "bg-emerald-50" };
    if (cert.expiryDate && cert.expiryDate < new Date()) return { label: "Caducado", color: "text-red-600", bg: "bg-red-50" };
    if (cert.expiryDate && cert.expiryDate < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)) return { label: "Por caducar", color: "text-amber-600", bg: "bg-amber-50" };
    return { label: "Válido", color: "text-emerald-600", bg: "bg-emerald-50" };
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { bg: string; text: string; label: string }> = {
      draft: { bg: "bg-slate-100", text: "text-slate-600", label: "Borrador" },
      pending: { bg: "bg-amber-50", text: "text-amber-700", label: "Pendiente" },
      pending_approval: { bg: "bg-purple-50", text: "text-purple-700", label: "Pend. aprob." },
      approved: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Aprobada" },
      paid: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Pagada" },
      rejected: { bg: "bg-red-50", text: "text-red-700", label: "Rechazada" },
      closed: { bg: "bg-blue-50", text: "text-blue-700", label: "Cerrada" },
      cancelled: { bg: "bg-slate-100", text: "text-slate-500", label: "Anulada" },
      overdue: { bg: "bg-red-50", text: "text-red-700", label: "Vencida" },
    };
    const c = config[status] || config.pending;
    return <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${c.bg} ${c.text}`}>{c.label}</span>;
  };

  // Generar PDF de listado de facturas
  const generateInvoiceListPdf = async () => {
    if (!supplier || invoices.length === 0) return;
    setGeneratingPdf("invoices");
    
    try {
      // Crear contenido HTML para el PDF
      const totalBase = invoices.reduce((sum, inv) => sum + inv.baseAmount, 0);
      const totalAmount = invoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
      const paidInvoices = invoices.filter(inv => inv.status === "paid");
      const pendingInvoices = invoices.filter(inv => inv.status !== "paid" && inv.status !== "cancelled");
      
      const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Helvetica', 'Arial', sans-serif; margin: 40px; color: #1e293b; font-size: 11px; }
    .header { border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 30px; }
    .title { font-size: 24px; font-weight: bold; color: #0f172a; margin: 0; }
    .subtitle { font-size: 14px; color: #64748b; margin-top: 8px; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 30px; }
    .info-box { background: #f8fafc; padding: 16px; border-radius: 8px; }
    .info-label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
    .info-value { font-size: 13px; font-weight: 600; color: #0f172a; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th { background: #f1f5f9; padding: 10px 12px; text-align: left; font-size: 10px; text-transform: uppercase; color: #64748b; border-bottom: 1px solid #e2e8f0; }
    td { padding: 12px; border-bottom: 1px solid #f1f5f9; }
    .amount { text-align: right; font-family: monospace; }
    .status { padding: 4px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; }
    .status-paid { background: #dcfce7; color: #166534; }
    .status-pending { background: #fef3c7; color: #92400e; }
    .totals { margin-top: 30px; background: #f8fafc; padding: 20px; border-radius: 8px; }
    .total-row { display: flex; justify-content: space-between; padding: 8px 0; }
    .total-label { color: #64748b; }
    .total-value { font-weight: 600; font-family: monospace; }
    .total-main { font-size: 16px; border-top: 2px solid #e2e8f0; padding-top: 12px; margin-top: 8px; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="header">
    <h1 class="title">Listado de Facturas</h1>
    <p class="subtitle">${supplier.fiscalName} · ${supplier.taxId}</p>
  </div>

  <div class="info-grid">
    <div class="info-box">
      <div class="info-label">Proyecto</div>
      <div class="info-value">${projectName}</div>
      ${producerNames.length > 0 ? `<div style="font-size: 11px; color: #64748b; margin-top: 4px;">${producerNames.join(", ")}</div>` : ""}
    </div>
    <div class="info-box">
      <div class="info-label">Resumen</div>
      <div class="info-value">${invoices.length} facturas</div>
      <div style="font-size: 11px; color: #64748b; margin-top: 4px;">${paidInvoices.length} pagadas · ${pendingInvoices.length} pendientes</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Nº Factura</th>
        <th>Fecha</th>
        <th>Descripción</th>
        <th class="amount">Base</th>
        <th class="amount">Total</th>
        <th>Estado</th>
      </tr>
    </thead>
    <tbody>
      ${invoices.map(inv => `
        <tr>
          <td style="font-weight: 600; font-family: monospace;">${inv.number}</td>
          <td>${formatDate(inv.issueDate)}</td>
          <td>${inv.description || "-"}</td>
          <td class="amount">${formatCurrency(inv.baseAmount)}</td>
          <td class="amount">${formatCurrency(inv.totalAmount)}</td>
          <td><span class="status ${inv.status === 'paid' ? 'status-paid' : 'status-pending'}">${inv.status === 'paid' ? 'Pagada' : 'Pendiente'}</span></td>
        </tr>
      `).join("")}
    </tbody>
  </table>

  <div class="totals">
    <div class="total-row">
      <span class="total-label">Total Base Imponible</span>
      <span class="total-value">${formatCurrency(totalBase)}</span>
    </div>
    <div class="total-row total-main">
      <span class="total-label" style="font-weight: 600; color: #0f172a;">TOTAL</span>
      <span class="total-value" style="font-size: 18px;">${formatCurrency(totalAmount)}</span>
    </div>
  </div>

  <div class="footer">
    Generado el ${new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })} · Filma Workspace
  </div>
</body>
</html>`;

      // Crear blob y descargar
      const blob = new Blob([htmlContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `facturas_${supplier.fiscalName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      setSuccessMessage("Listado de facturas generado");
    } catch (error) {
      setErrorMessage("Error generando el documento");
    } finally {
      setGeneratingPdf(null);
      setShowActionsMenu(false);
    }
  };

  // Generar Carta de Fin de Proyecto
  const generateEndOfProjectLetter = async () => {
    if (!supplier) return;
    setGeneratingPdf("letter");
    
    try {
      const paidInvoices = invoices.filter(inv => inv.status === "paid");
      const totalPaid = paidInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
      const today = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
      
      const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Georgia', serif; margin: 60px; color: #1e293b; font-size: 12px; line-height: 1.8; }
    .letterhead { text-align: center; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 1px solid #e2e8f0; }
    .letterhead-title { font-size: 18px; font-weight: bold; color: #0f172a; letter-spacing: 1px; }
    .letterhead-subtitle { font-size: 11px; color: #64748b; margin-top: 4px; }
    .date { text-align: right; margin-bottom: 40px; color: #64748b; }
    .recipient { margin-bottom: 30px; }
    .recipient-name { font-weight: bold; font-size: 14px; }
    .content { margin-bottom: 30px; }
    .content p { margin-bottom: 16px; text-align: justify; }
    .highlight { background: #f0fdf4; padding: 20px; border-radius: 8px; border-left: 4px solid #22c55e; margin: 30px 0; }
    .highlight-title { font-weight: bold; color: #166534; margin-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; font-family: 'Helvetica', sans-serif; font-size: 11px; }
    th { background: #f8fafc; padding: 10px 12px; text-align: left; font-size: 10px; text-transform: uppercase; color: #64748b; border: 1px solid #e2e8f0; }
    td { padding: 10px 12px; border: 1px solid #e2e8f0; }
    .amount { text-align: right; font-family: monospace; }
    .total-row { background: #f8fafc; font-weight: bold; }
    .signature { margin-top: 60px; }
    .signature-line { width: 250px; border-top: 1px solid #1e293b; margin-top: 60px; padding-top: 8px; }
    .footer { margin-top: 60px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; text-align: center; }
  </style>
</head>
<body>
  <div class="letterhead">
    <div class="letterhead-title">${projectConfig?.fiscalName || projectName}</div>
    ${projectConfig?.taxId ? `<div class="letterhead-subtitle">CIF: ${projectConfig.taxId}</div>` : ""}
    ${projectConfig?.address ? `<div class="letterhead-subtitle">${projectConfig.address}, ${projectConfig.postalCode} ${projectConfig.city}</div>` : ""}
  </div>

  <div class="date">${today}</div>

  <div class="recipient">
    <div class="recipient-name">${supplier.fiscalName}</div>
    <div>${supplier.taxId}</div>
    ${supplier.address?.street ? `<div>${supplier.address.street} ${supplier.address.number}</div>` : ""}
    ${supplier.address?.city ? `<div>${supplier.address.postalCode} ${supplier.address.city}</div>` : ""}
  </div>

  <div class="content">
    <p><strong>Asunto: Certificado de cierre de relación comercial - Proyecto "${projectName}"</strong></p>
    
    <p>Por medio de la presente, ${projectConfig?.fiscalName || "la productora"} certifica que, con fecha de hoy, <strong>no existen facturas pendientes de pago</strong> correspondientes a los servicios prestados por ${supplier.fiscalName} en el marco del proyecto audiovisual "${projectName}"${producerNames.length > 0 ? `, producido por ${producerNames.join(" y ")}` : ""}.</p>

    <div class="highlight">
      <div class="highlight-title">✓ Todas las facturas han sido abonadas</div>
      La relación comercial con ${supplier.commercialName || supplier.fiscalName} ha quedado debidamente liquidada.
    </div>

    ${paidInvoices.length > 0 ? `
    <p>A continuación se detalla el histórico de facturas correspondientes a este proyecto:</p>

    <table>
      <thead>
        <tr>
          <th>Nº Factura</th>
          <th>Fecha</th>
          <th>Concepto</th>
          <th class="amount">Importe</th>
          <th>Fecha Pago</th>
        </tr>
      </thead>
      <tbody>
        ${paidInvoices.map(inv => `
          <tr>
            <td style="font-family: monospace;">${inv.number}</td>
            <td>${formatDate(inv.issueDate)}</td>
            <td>${inv.description || "-"}</td>
            <td class="amount">${formatCurrency(inv.totalAmount)}</td>
            <td>${inv.paidAt ? formatDate(inv.paidAt) : "-"}</td>
          </tr>
        `).join("")}
        <tr class="total-row">
          <td colspan="3">TOTAL ABONADO</td>
          <td class="amount">${formatCurrency(totalPaid)}</td>
          <td></td>
        </tr>
      </tbody>
    </table>
    ` : "<p>No constan facturas registradas para este proveedor en el proyecto.</p>"}

    <p>Se expide el presente certificado a petición del interesado y para los efectos que estime oportunos.</p>
  </div>

  <div class="signature">
    <p>Atentamente,</p>
    <div class="signature-line">
      <div style="font-weight: bold;">${projectConfig?.fiscalName || projectName}</div>
      <div style="color: #64748b; font-size: 11px;">Departamento de Producción</div>
    </div>
  </div>

  <div class="footer">
    Documento generado automáticamente · Filma Workspace · ${today}
  </div>
</body>
</html>`;

      const blob = new Blob([htmlContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `carta_fin_proyecto_${supplier.fiscalName.replace(/\s+/g, '_')}_${projectName.replace(/\s+/g, '_')}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      setSuccessMessage("Carta de fin de proyecto generada");
    } catch (error) {
      setErrorMessage("Error generando el documento");
    } finally {
      setGeneratingPdf(null);
      setShowActionsMenu(false);
    }
  };

  // Exportar datos a CSV
  const exportToCSV = () => {
    if (invoices.length === 0) return;
    
    const headers = ["Número", "Fecha", "Descripción", "Base", "Total", "Estado", "Fecha Pago"];
    const rows = invoices.map(inv => [
      inv.number,
      formatDate(inv.issueDate),
      inv.description || "",
      inv.baseAmount.toString(),
      inv.totalAmount.toString(),
      inv.status,
      inv.paidAt ? formatDate(inv.paidAt) : ""
    ]);
    
    const csvContent = [headers, ...rows].map(row => row.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `facturas_${supplier?.fiscalName.replace(/\s+/g, '_')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    setSuccessMessage("CSV exportado");
    setShowActionsMenu(false);
  };

  // Enviar email al contacto
  const sendEmail = () => {
    if (!supplier?.contact?.email) return;
    const subject = encodeURIComponent(`Proyecto ${projectName} - ${supplier.fiscalName}`);
    window.open(`mailto:${supplier.contact.email}?subject=${subject}`, '_blank');
    setShowActionsMenu(false);
  };

  if (loading) return <div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}><div className="w-10 h-10 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" /></div>;

  if (!supplier) return (
    <div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}>
      <div className="text-center">
        <p className="text-slate-500 mb-4">Proveedor no encontrado</p>
        <Link href={`/project/${projectId}/accounting/suppliers`} className="text-indigo-600 hover:underline">Volver a proveedores</Link>
      </div>
    </div>
  );

  const pendingInvoices = invoices.filter(inv => inv.status !== "paid" && inv.status !== "cancelled");
  const hasPendingInvoices = pendingInvoices.length > 0;

  return (
    <div className={`min-h-screen bg-white ${inter.className}`}>
      {/* Header */}
      <div className="mt-[4.5rem]">
        <div className="px-6 md:px-8 lg:px-12 xl:px-16 2xl:px-24 py-6">
          <div className="flex items-start justify-between border-b border-slate-200 pb-6">
            <div className="flex items-center gap-4">
              <Link 
                href={`/project/${projectId}/accounting/suppliers`} 
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <ArrowLeft size={20} />
              </Link>
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">{supplier.fiscalName}</h1>
                <div className="flex items-center gap-2 mt-1">
                  {supplier.commercialName && <span className="text-slate-500">{supplier.commercialName}</span>}
                  <span className="text-slate-300">·</span>
                  <span className="font-mono text-sm text-slate-500">{supplier.taxId}</span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {/* Actions Dropdown */}
              <div className="relative">
                <button 
                  onClick={() => setShowActionsMenu(!showActionsMenu)}
                  className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors"
                >
                  <Download size={16} />
                  Exportar
                  <ChevronRight size={14} className={`transition-transform ${showActionsMenu ? 'rotate-90' : ''}`} />
                </button>
                
                {showActionsMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowActionsMenu(false)} />
                    <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-slate-200 rounded-2xl shadow-xl py-2 z-20">
                      <button
                        onClick={generateInvoiceListPdf}
                        disabled={invoices.length === 0 || generatingPdf === "invoices"}
                        className="w-full px-4 py-3 text-left text-sm hover:bg-slate-50 flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <FileText size={16} className="text-slate-400" />
                        <div>
                          <p className="font-medium text-slate-900">Listado de facturas</p>
                          <p className="text-xs text-slate-500">PDF con todas las facturas</p>
                        </div>
                      </button>
                      
                      <button
                        onClick={generateEndOfProjectLetter}
                        disabled={hasPendingInvoices || generatingPdf === "letter"}
                        className="w-full px-4 py-3 text-left text-sm hover:bg-slate-50 flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <FileSpreadsheet size={16} className="text-slate-400" />
                        <div>
                          <p className="font-medium text-slate-900">Carta fin de proyecto</p>
                          <p className="text-xs text-slate-500">
                            {hasPendingInvoices ? "Requiere todas las facturas pagadas" : "Certificado de cierre"}
                          </p>
                        </div>
                      </button>
                      
                      <div className="border-t border-slate-100 my-1" />
                      
                      <button
                        onClick={exportToCSV}
                        disabled={invoices.length === 0}
                        className="w-full px-4 py-3 text-left text-sm hover:bg-slate-50 flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Download size={16} className="text-slate-400" />
                        <div>
                          <p className="font-medium text-slate-900">Exportar CSV</p>
                          <p className="text-xs text-slate-500">Para Excel o Google Sheets</p>
                        </div>
                      </button>
                      
                      {supplier.contact?.email && (
                        <>
                          <div className="border-t border-slate-100 my-1" />
                          <button
                            onClick={sendEmail}
                            className="w-full px-4 py-3 text-left text-sm hover:bg-slate-50 flex items-center gap-3"
                          >
                            <Send size={16} className="text-slate-400" />
                            <div>
                              <p className="font-medium text-slate-900">Enviar email</p>
                              <p className="text-xs text-slate-500">{supplier.contact.email}</p>
                            </div>
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>

              <button 
                onClick={handleDelete} 
                disabled={invoices.length > 0 || pos.length > 0} 
                className="p-2.5 border border-slate-200 text-slate-500 rounded-xl hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed" 
                title="Eliminar"
              >
                <Trash2 size={18} />
              </button>
              
              <Link 
                href={`/project/${projectId}/accounting/suppliers/${supplierId}/edit`} 
                className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800"
              >
                <Edit size={16} />
                Editar
              </Link>
            </div>
          </div>
        </div>
      </div>

      <main className="px-6 md:px-8 lg:px-12 xl:px-16 2xl:px-24 py-8">
        {errorMessage && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-700 text-sm">
            <AlertCircle size={18} /><span className="flex-1">{errorMessage}</span>
            <button onClick={() => setErrorMessage("")}><X size={16} /></button>
          </div>
        )}
        {successMessage && (
          <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-emerald-700 text-sm">
            <CheckCircle size={18} /><span>{successMessage}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Columna izquierda - Info principal */}
          <div className="lg:col-span-2 space-y-6">
            {/* Datos principales */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-xs text-slate-500 mb-1">País</p>
                <p className="font-semibold text-slate-900">{COUNTRIES[supplier.country] || supplier.country}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-xs text-slate-500 mb-1">Método de pago</p>
                <p className="font-semibold text-slate-900">{PAYMENT_METHODS[supplier.paymentMethod]}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-xs text-slate-500 mb-1">POs</p>
                <p className="font-semibold text-slate-900">{pos.length}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-xs text-slate-500 mb-1">Facturas</p>
                <p className="font-semibold text-slate-900">{invoices.length}</p>
              </div>
            </div>

            {/* IBAN */}
            {supplier.bankAccount && (
              <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-indigo-600 mb-1 flex items-center gap-1"><CreditCard size={12} />Cuenta bancaria</p>
                    <p className="font-mono font-bold text-indigo-900 text-lg">{formatIBAN(supplier.bankAccount)}</p>
                  </div>
                  <button 
                    onClick={() => copyToClipboard(supplier.bankAccount, "IBAN")}
                    className="p-2 text-indigo-600 hover:bg-indigo-100 rounded-lg transition-colors"
                    title="Copiar IBAN"
                  >
                    <Copy size={16} />
                  </button>
                </div>
              </div>
            )}

            {/* Últimas facturas */}
            {invoices.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                  <h2 className="font-semibold text-slate-900">Facturas recientes</h2>
                  <Link 
                    href={`/project/${projectId}/accounting/invoices?supplier=${supplierId}`}
                    className="text-xs text-indigo-600 hover:underline flex items-center gap-1"
                  >
                    Ver todas <ExternalLink size={12} />
                  </Link>
                </div>
                <div className="divide-y divide-slate-100">
                  {invoices.slice(0, 5).map(inv => (
                    <Link 
                      key={inv.id} 
                      href={`/project/${projectId}/accounting/invoices/${inv.id}`}
                      className="flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm font-semibold text-slate-900">{inv.number}</span>
                        <span className="text-sm text-slate-500">{inv.description || "-"}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm font-semibold text-slate-900">{formatCurrency(inv.totalAmount)}</span>
                        {getStatusBadge(inv.status)}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Últimas POs */}
            {pos.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                  <h2 className="font-semibold text-slate-900">Órdenes de compra</h2>
                  <Link 
                    href={`/project/${projectId}/accounting/pos?supplier=${supplierId}`}
                    className="text-xs text-indigo-600 hover:underline flex items-center gap-1"
                  >
                    Ver todas <ExternalLink size={12} />
                  </Link>
                </div>
                <div className="divide-y divide-slate-100">
                  {pos.slice(0, 5).map(po => (
                    <Link 
                      key={po.id} 
                      href={`/project/${projectId}/accounting/pos/${po.id}`}
                      className="flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm font-semibold text-slate-900">PO-{po.number}</span>
                        <span className="text-sm text-slate-500 truncate max-w-[200px]">{po.description || "-"}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm font-semibold text-slate-900">{formatCurrency(po.baseAmount)}</span>
                        {getStatusBadge(po.status)}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Columna derecha - Contacto y certificados */}
          <div className="space-y-6">
            {/* Contacto */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h2 className="font-semibold text-slate-900">Contacto</h2>
              </div>
              <div className="p-5 space-y-4">
                {supplier.contact?.name ? (
                  <>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                        <User size={18} className="text-slate-500" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{supplier.contact.name}</p>
                        <p className="text-xs text-slate-500">Persona de contacto</p>
                      </div>
                    </div>
                    
                    {supplier.contact.email && (
                      <a 
                        href={`mailto:${supplier.contact.email}`}
                        className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors"
                      >
                        <Mail size={16} className="text-slate-400" />
                        <span className="text-sm text-slate-700">{supplier.contact.email}</span>
                      </a>
                    )}
                    
                    {supplier.contact.phone && (
                      <a 
                        href={`tel:${supplier.contact.phone}`}
                        className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors"
                      >
                        <Phone size={16} className="text-slate-400" />
                        <span className="text-sm text-slate-700">{supplier.contact.phone}</span>
                      </a>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-slate-400 text-center py-4">Sin contacto registrado</p>
                )}
              </div>
            </div>

            {/* Dirección */}
            {supplier.address?.street && (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h2 className="font-semibold text-slate-900">Dirección</h2>
                </div>
                <div className="p-5">
                  <div className="flex items-start gap-3">
                    <MapPin size={16} className="text-slate-400 mt-0.5" />
                    <div className="text-sm text-slate-700">
                      <p>{supplier.address.street} {supplier.address.number}</p>
                      <p>{supplier.address.postalCode} {supplier.address.city}</p>
                      {supplier.address.province && <p>{supplier.address.province}</p>}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Certificados */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h2 className="font-semibold text-slate-900">Certificados</h2>
              </div>
              <div className="p-5 space-y-3">
                {/* Titularidad */}
                <div className="p-4 border border-slate-200 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-slate-900">Titularidad bancaria</p>
                    <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${getCertStatus(supplier.certificates.bankOwnership).bg} ${getCertStatus(supplier.certificates.bankOwnership).color}`}>
                      {getCertStatus(supplier.certificates.bankOwnership).label}
                    </span>
                  </div>
                  {supplier.certificates.bankOwnership.expiryDate && (
                    <p className="text-xs text-slate-500 flex items-center gap-1">
                      <Calendar size={12} />
                      Caduca: {formatDate(supplier.certificates.bankOwnership.expiryDate)}
                    </p>
                  )}
                  {supplier.certificates.bankOwnership.verified && supplier.certificates.bankOwnership.verifiedByName && (
                    <p className="text-xs text-emerald-600 mt-1">✓ Verificado por {supplier.certificates.bankOwnership.verifiedByName}</p>
                  )}
                  {canVerify && supplier.certificates.bankOwnership.uploaded && (
                    <button 
                      onClick={() => handleVerify("bankOwnership", !supplier.certificates.bankOwnership.verified)} 
                      className="mt-2 text-xs text-indigo-600 hover:underline"
                    >
                      {supplier.certificates.bankOwnership.verified ? "Quitar verificación" : "Marcar como verificado"}
                    </button>
                  )}
                </div>

                {/* Contratistas */}
                <div className="p-4 border border-slate-200 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-slate-900">Cert. contratistas</p>
                    <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${getCertStatus(supplier.certificates.contractorsCertificate).bg} ${getCertStatus(supplier.certificates.contractorsCertificate).color}`}>
                      {getCertStatus(supplier.certificates.contractorsCertificate).label}
                    </span>
                  </div>
                  {supplier.certificates.contractorsCertificate.expiryDate && (
                    <p className="text-xs text-slate-500 flex items-center gap-1">
                      <Calendar size={12} />
                      Caduca: {formatDate(supplier.certificates.contractorsCertificate.expiryDate)}
                    </p>
                  )}
                  {supplier.certificates.contractorsCertificate.verified && supplier.certificates.contractorsCertificate.verifiedByName && (
                    <p className="text-xs text-emerald-600 mt-1">✓ Verificado por {supplier.certificates.contractorsCertificate.verifiedByName}</p>
                  )}
                  {canVerify && supplier.certificates.contractorsCertificate.uploaded && (
                    <button 
                      onClick={() => handleVerify("contractorsCertificate", !supplier.certificates.contractorsCertificate.verified)} 
                      className="mt-2 text-xs text-indigo-600 hover:underline"
                    >
                      {supplier.certificates.contractorsCertificate.verified ? "Quitar verificación" : "Marcar como verificado"}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Info adicional */}
            <div className="text-xs text-slate-400 text-center">
              <p>Proveedor desde {formatDate(supplier.createdAt)}</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
