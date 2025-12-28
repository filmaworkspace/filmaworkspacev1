"use client";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Inter } from "next/font/google";
import { useState, useEffect } from "react";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, collection, getDocs, updateDoc, deleteDoc, query, where, orderBy, Timestamp } from "firebase/firestore";
import { Building2, ArrowLeft, Edit, Trash2, Mail, Phone, User, Globe, CreditCard, MapPin, FileText, ShieldCheck, FileCheck, FileX, AlertCircle, CheckCircle, Clock, Hash, Calendar, Receipt, Package, ExternalLink, X } from "lucide-react";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

interface Address { street: string; number: string; city: string; province: string; postalCode: string; }
interface Contact { name: string; email: string; phone: string; }
interface Certificate { url?: string; expiryDate?: Date; uploaded: boolean; fileName?: string; verified?: boolean; verifiedBy?: string; verifiedByName?: string; verifiedAt?: Date; }

interface Supplier {
  id: string;
  fiscalName: string;
  commercialName: string;
  country: string;
  taxId: string;
  address: Address;
  contact: Contact;
  paymentMethod: string;
  bankAccount: string;
  certificates: {
    bankOwnership: Certificate;
    contractorsCertificate: Certificate;
  };
  createdAt: Date;
  createdBy: string;
  hasAssignedPOs: boolean;
  hasAssignedInvoices: boolean;
}

interface PO {
  id: string;
  number: string;
  description: string;
  totalAmount: number;
  status: string;
  createdAt: Date;
}

interface Invoice {
  id: string;
  displayNumber: string;
  description: string;
  totalAmount: number;
  status: string;
  createdAt: Date;
}

const COUNTRIES: Record<string, string> = {
  ES: "España", FR: "Francia", DE: "Alemania", IT: "Italia", PT: "Portugal", UK: "Reino Unido", US: "Estados Unidos",
};

const PAYMENT_METHODS: Record<string, string> = {
  transferencia: "Transferencia bancaria",
  tb30: "Transferencia 30 días",
  tb60: "Transferencia 60 días",
  tarjeta: "Tarjeta",
  efectivo: "Efectivo",
};

export default function SupplierDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params?.id as string;
  const supplierId = params?.supplierId as string;

  const [loading, setLoading] = useState(true);
  const [projectName, setProjectName] = useState("");
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [pos, setPOs] = useState<PO[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState("");
  const [userAccountingLevel, setUserAccountingLevel] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const canVerifyCertificates = userAccountingLevel === "accounting_extended";

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        setUserId(user.uid);
        setUserName(user.displayName || user.email || "Usuario");
        try {
          const memberDoc = await getDoc(doc(db, `projects/${projectId}/members`, user.uid));
          if (memberDoc.exists()) {
            setUserAccountingLevel(memberDoc.data().accountingAccessLevel || "user");
          }
        } catch (e) { console.error(e); }
      }
    });
    return () => unsubscribe();
  }, [projectId]);

  useEffect(() => {
    if (userId && projectId && supplierId) loadData();
  }, [userId, projectId, supplierId]);

  const loadData = async () => {
    try {
      setLoading(true);

      // Cargar proyecto
      const projectDoc = await getDoc(doc(db, "projects", projectId));
      if (projectDoc.exists()) setProjectName(projectDoc.data().name || "Proyecto");

      // Cargar proveedor
      const supplierDoc = await getDoc(doc(db, `projects/${projectId}/suppliers`, supplierId));
      if (!supplierDoc.exists()) {
        setErrorMessage("Proveedor no encontrado");
        setLoading(false);
        return;
      }

      const data = supplierDoc.data();
      setSupplier({
        id: supplierDoc.id,
        fiscalName: data.fiscalName || "",
        commercialName: data.commercialName || "",
        country: data.country || "ES",
        taxId: data.taxId || "",
        address: data.address || { street: "", number: "", city: "", province: "", postalCode: "" },
        contact: data.contact || { name: "", email: "", phone: "" },
        paymentMethod: data.paymentMethod || "transferencia",
        bankAccount: data.bankAccount || "",
        certificates: {
          bankOwnership: {
            ...data.certificates?.bankOwnership,
            expiryDate: data.certificates?.bankOwnership?.expiryDate?.toDate(),
            uploaded: data.certificates?.bankOwnership?.uploaded || false,
            verified: data.certificates?.bankOwnership?.verified || false,
            verifiedAt: data.certificates?.bankOwnership?.verifiedAt?.toDate(),
          },
          contractorsCertificate: {
            ...data.certificates?.contractorsCertificate,
            expiryDate: data.certificates?.contractorsCertificate?.expiryDate?.toDate(),
            uploaded: data.certificates?.contractorsCertificate?.uploaded || false,
            verified: data.certificates?.contractorsCertificate?.verified || false,
            verifiedAt: data.certificates?.contractorsCertificate?.verifiedAt?.toDate(),
          },
        },
        createdAt: data.createdAt?.toDate() || new Date(),
        createdBy: data.createdBy || "",
        hasAssignedPOs: data.hasAssignedPOs || false,
        hasAssignedInvoices: data.hasAssignedInvoices || false,
      });

      // Cargar POs del proveedor
      const posQuery = query(
        collection(db, `projects/${projectId}/pos`),
        where("supplierId", "==", supplierId),
        orderBy("createdAt", "desc")
      );
      const posSnapshot = await getDocs(posQuery);
      const posData = posSnapshot.docs.map((d) => ({
        id: d.id,
        number: d.data().number || "",
        description: d.data().description || "",
        totalAmount: d.data().totalAmount || 0,
        status: d.data().status || "draft",
        createdAt: d.data().createdAt?.toDate() || new Date(),
      }));
      setPOs(posData);

      // Cargar facturas del proveedor
      const invoicesQuery = query(
        collection(db, `projects/${projectId}/invoices`),
        where("supplierId", "==", supplierId),
        orderBy("createdAt", "desc")
      );
      const invoicesSnapshot = await getDocs(invoicesQuery);
      const invoicesData = invoicesSnapshot.docs.map((d) => ({
        id: d.id,
        displayNumber: d.data().displayNumber || `FAC-${d.data().number}`,
        description: d.data().description || "",
        totalAmount: d.data().totalAmount || 0,
        status: d.data().status || "pending",
        createdAt: d.data().createdAt?.toDate() || new Date(),
      }));
      setInvoices(invoicesData);

    } catch (error: any) {
      console.error("Error loading data:", error);
      setErrorMessage(`Error cargando datos: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCertificate = async (certType: "bankOwnership" | "contractorsCertificate", verified: boolean) => {
    if (!supplier || !canVerifyCertificates) return;

    try {
      const updateData: any = {
        [`certificates.${certType}.verified`]: verified,
      };

      if (verified) {
        updateData[`certificates.${certType}.verifiedBy`] = userId;
        updateData[`certificates.${certType}.verifiedByName`] = userName;
        updateData[`certificates.${certType}.verifiedAt`] = Timestamp.now();
      } else {
        updateData[`certificates.${certType}.verifiedBy`] = null;
        updateData[`certificates.${certType}.verifiedByName`] = null;
        updateData[`certificates.${certType}.verifiedAt`] = null;
      }

      await updateDoc(doc(db, `projects/${projectId}/suppliers`, supplierId), updateData);
      setSuccessMessage(verified ? "Certificado verificado" : "Verificación eliminada");
      setTimeout(() => setSuccessMessage(""), 3000);
      await loadData();
    } catch (error: any) {
      setErrorMessage(`Error: ${error.message}`);
    }
  };

  const handleDelete = async () => {
    if (!supplier) return;
    if (supplier.hasAssignedPOs || supplier.hasAssignedInvoices || pos.length > 0 || invoices.length > 0) {
      setErrorMessage("No se puede eliminar un proveedor con POs o facturas asignadas");
      setShowDeleteConfirm(false);
      return;
    }

    try {
      await deleteDoc(doc(db, `projects/${projectId}/suppliers`, supplierId));
      router.push(`/project/${projectId}/accounting/suppliers`);
    } catch (error: any) {
      setErrorMessage(`Error eliminando: ${error.message}`);
    }
  };

  const formatIBAN = (iban: string): string => {
    const clean = iban.replace(/\s/g, "").toUpperCase();
    return clean.match(/.{1,4}/g)?.join(" ") || clean;
  };

  const formatDate = (date: Date) => date ? new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", year: "numeric" }).format(date) : "-";
  const formatCurrency = (amount: number) => new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount || 0);

  const getCertificateStatus = (cert: Certificate): "valid" | "expiring" | "expired" | "pending" | "not_uploaded" => {
    if (!cert.uploaded) return "not_uploaded";
    if (cert.verified) return "valid";
    if (!cert.expiryDate) return "pending";
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    if (cert.expiryDate < now) return "expired";
    if (cert.expiryDate < thirtyDaysFromNow) return "expiring";
    return "valid";
  };

  const getCertificateBadge = (cert: Certificate) => {
    const status = getCertificateStatus(cert);
    const configs: Record<string, { icon: any; bg: string; text: string; label: string }> = {
      not_uploaded: { icon: FileX, bg: "bg-red-50", text: "text-red-700", label: "No subido" },
      expired: { icon: AlertCircle, bg: "bg-red-50", text: "text-red-700", label: "Caducado" },
      expiring: { icon: Clock, bg: "bg-amber-50", text: "text-amber-700", label: "Por caducar" },
      pending: { icon: FileCheck, bg: "bg-blue-50", text: "text-blue-700", label: "Pendiente" },
      valid: { icon: cert.verified ? ShieldCheck : CheckCircle, bg: cert.verified ? "bg-emerald-50" : "bg-emerald-50", text: "text-emerald-700", label: cert.verified ? "Verificado" : "Válido" },
    };
    const config = configs[status];
    const Icon = config.icon;
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${config.bg} ${config.text}`}>
        <Icon size={14} />
        {config.label}
      </span>
    );
  };

  const getStatusBadge = (status: string) => {
    const configs: Record<string, { bg: string; text: string; label: string }> = {
      draft: { bg: "bg-slate-100", text: "text-slate-700", label: "Borrador" },
      pending_approval: { bg: "bg-purple-50", text: "text-purple-700", label: "Pte. aprobación" },
      approved: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Aprobada" },
      closed: { bg: "bg-slate-100", text: "text-slate-600", label: "Cerrada" },
      cancelled: { bg: "bg-red-50", text: "text-red-700", label: "Cancelada" },
      pending: { bg: "bg-amber-50", text: "text-amber-700", label: "Pte. pago" },
      paid: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Pagada" },
      overdue: { bg: "bg-red-50", text: "text-red-700", label: "Vencida" },
      rejected: { bg: "bg-red-50", text: "text-red-700", label: "Rechazada" },
    };
    const config = configs[status] || configs.draft;
    return <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${config.bg} ${config.text}`}>{config.label}</span>;
  };

  if (loading) {
    return (
      <div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}>
        <div className="w-12 h-12 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
      </div>
    );
  }

  if (!supplier) {
    return (
      <div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}>
        <div className="text-center">
          <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={28} className="text-red-500" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Proveedor no encontrado</h2>
          <Link href={`/project/${projectId}/accounting/suppliers`} className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800">
            <ArrowLeft size={16} />Volver a proveedores
          </Link>
        </div>
      </div>
    );
  }

  const overallStatus = getCertificateStatus(supplier.certificates.bankOwnership) === "valid" && getCertificateStatus(supplier.certificates.contractorsCertificate) === "valid" ? "valid" : getCertificateStatus(supplier.certificates.bankOwnership) === "expired" || getCertificateStatus(supplier.certificates.contractorsCertificate) === "expired" || getCertificateStatus(supplier.certificates.bankOwnership) === "not_uploaded" || getCertificateStatus(supplier.certificates.contractorsCertificate) === "not_uploaded" ? "expired" : "expiring";

  return (
    <div className={`min-h-screen bg-slate-50 ${inter.className}`}>
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 md:px-12 py-6">
          {/* Breadcrumb */}
          <div className="mb-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">
              <Link href="/dashboard" className="inline-flex items-center gap-1 hover:text-slate-900 transition-colors"><ArrowLeft size={12} />Proyectos</Link>
              <span className="text-slate-300">·</span>
              <Link href={`/project/${projectId}/accounting`} className="hover:text-slate-900 transition-colors">Panel</Link>
              <span className="text-slate-300">·</span>
              <Link href={`/project/${projectId}/accounting/suppliers`} className="hover:text-slate-900 transition-colors">Proveedores</Link>
              <span className="text-slate-300">·</span>
              <span className="uppercase text-slate-500">{projectName}</span>
            </div>
          </div>

          {/* Supplier Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg">
                <Building2 size={28} className="text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">{supplier.fiscalName}</h1>
                {supplier.commercialName && (
                  <p className="text-slate-500 mt-0.5">{supplier.commercialName}</p>
                )}
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-sm font-mono text-slate-600 bg-slate-100 px-2 py-0.5 rounded">{supplier.taxId}</span>
                  {overallStatus === "valid" && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-700">
                      <CheckCircle size={12} />Documentación completa
                    </span>
                  )}
                  {overallStatus === "expiring" && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium bg-amber-50 text-amber-700">
                      <Clock size={12} />Documentos por caducar
                    </span>
                  )}
                  {overallStatus === "expired" && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium bg-red-50 text-red-700">
                      <AlertCircle size={12} />Acción requerida
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Link href={`/project/${projectId}/accounting/suppliers`} className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors">
                <ArrowLeft size={16} />Volver
              </Link>
              <Link href={`/project/${projectId}/accounting/suppliers/${supplierId}/edit`} className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors">
                <Edit size={16} />Editar
              </Link>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-6 md:px-12 py-8">
        {/* Messages */}
        {errorMessage && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-700">
            <AlertCircle size={20} /><span className="flex-1">{errorMessage}</span>
            <button onClick={() => setErrorMessage("")}><X size={16} /></button>
          </div>
        )}
        {successMessage && (
          <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-emerald-700">
            <CheckCircle size={20} /><span>{successMessage}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Columna izquierda - Info principal */}
          <div className="lg:col-span-2 space-y-6">
            {/* Información fiscal y bancaria */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h2 className="font-semibold text-slate-900">Información fiscal</h2>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1"><Hash size={12} />NIF/CIF</p>
                    <p className="text-lg font-mono font-bold text-slate-900">{supplier.taxId}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1"><Globe size={12} />País</p>
                    <p className="text-lg font-medium text-slate-900">{COUNTRIES[supplier.country] || supplier.country}</p>
                  </div>
                </div>

                {supplier.bankAccount && (
                  <div className="mt-6 p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                    <p className="text-xs text-indigo-600 uppercase tracking-wider mb-1 flex items-center gap-1"><CreditCard size={12} />Cuenta bancaria (IBAN)</p>
                    <p className="text-lg font-mono font-bold text-indigo-900">{formatIBAN(supplier.bankAccount)}</p>
                    <p className="text-xs text-indigo-600 mt-2">Método de pago: {PAYMENT_METHODS[supplier.paymentMethod] || supplier.paymentMethod}</p>
                  </div>
                )}

                {(supplier.address.street || supplier.address.city) && (
                  <div className="mt-6 pt-6 border-t border-slate-100">
                    <p className="text-xs text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1"><MapPin size={12} />Dirección</p>
                    <p className="text-sm text-slate-700">
                      {supplier.address.street && `${supplier.address.street} ${supplier.address.number}`}
                      {supplier.address.street && supplier.address.city && ", "}
                      {supplier.address.postalCode} {supplier.address.city}
                      {supplier.address.province && ` (${supplier.address.province})`}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Certificados */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h2 className="font-semibold text-slate-900">Certificados</h2>
              </div>
              <div className="p-6 space-y-4">
                {/* Titularidad bancaria */}
                <div className="border border-slate-200 rounded-xl p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-medium text-slate-900">Certificado de titularidad bancaria</h3>
                        {getCertificateBadge(supplier.certificates.bankOwnership)}
                      </div>
                      {supplier.certificates.bankOwnership.expiryDate && (
                        <p className="text-sm text-slate-500 flex items-center gap-1">
                          <Calendar size={14} />
                          Caduca: {formatDate(supplier.certificates.bankOwnership.expiryDate)}
                        </p>
                      )}
                      {supplier.certificates.bankOwnership.verified && supplier.certificates.bankOwnership.verifiedByName && (
                        <p className="text-xs text-emerald-600 mt-2 flex items-center gap-1">
                          <ShieldCheck size={12} />
                          Verificado por {supplier.certificates.bankOwnership.verifiedByName} el {formatDate(supplier.certificates.bankOwnership.verifiedAt!)}
                        </p>
                      )}
                      {supplier.certificates.bankOwnership.fileName && (
                        <p className="text-xs text-slate-400 mt-1">Archivo: {supplier.certificates.bankOwnership.fileName}</p>
                      )}
                    </div>
                    {canVerifyCertificates && supplier.certificates.bankOwnership.uploaded && (
                      <button
                        onClick={() => handleVerifyCertificate("bankOwnership", !supplier.certificates.bankOwnership.verified)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          supplier.certificates.bankOwnership.verified
                            ? "bg-slate-100 text-slate-600 hover:bg-slate-200"
                            : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                        }`}
                      >
                        {supplier.certificates.bankOwnership.verified ? "Quitar verificación" : "Verificar"}
                      </button>
                    )}
                  </div>
                </div>

                {/* Certificado contratistas */}
                <div className="border border-slate-200 rounded-xl p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-medium text-slate-900">Certificado de contratistas</h3>
                        {getCertificateBadge(supplier.certificates.contractorsCertificate)}
                      </div>
                      {supplier.certificates.contractorsCertificate.expiryDate && (
                        <p className="text-sm text-slate-500 flex items-center gap-1">
                          <Calendar size={14} />
                          Caduca: {formatDate(supplier.certificates.contractorsCertificate.expiryDate)}
                        </p>
                      )}
                      {supplier.certificates.contractorsCertificate.verified && supplier.certificates.contractorsCertificate.verifiedByName && (
                        <p className="text-xs text-emerald-600 mt-2 flex items-center gap-1">
                          <ShieldCheck size={12} />
                          Verificado por {supplier.certificates.contractorsCertificate.verifiedByName} el {formatDate(supplier.certificates.contractorsCertificate.verifiedAt!)}
                        </p>
                      )}
                      {supplier.certificates.contractorsCertificate.fileName && (
                        <p className="text-xs text-slate-400 mt-1">Archivo: {supplier.certificates.contractorsCertificate.fileName}</p>
                      )}
                    </div>
                    {canVerifyCertificates && supplier.certificates.contractorsCertificate.uploaded && (
                      <button
                        onClick={() => handleVerifyCertificate("contractorsCertificate", !supplier.certificates.contractorsCertificate.verified)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          supplier.certificates.contractorsCertificate.verified
                            ? "bg-slate-100 text-slate-600 hover:bg-slate-200"
                            : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                        }`}
                      >
                        {supplier.certificates.contractorsCertificate.verified ? "Quitar verificación" : "Verificar"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Columna derecha - Contacto y acciones */}
          <div className="space-y-6">
            {/* Contacto */}
            {supplier.contact?.name && (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                  <h2 className="font-semibold text-slate-900">Persona de contacto</h2>
                </div>
                <div className="p-6 space-y-4">
                  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                    <div className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center">
                      <User size={18} className="text-slate-600" />
                    </div>
                    <span className="text-sm font-medium text-slate-900">{supplier.contact.name}</span>
                  </div>
                  {supplier.contact.email && (
                    <a href={`mailto:${supplier.contact.email}`} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors">
                      <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                        <Mail size={18} className="text-indigo-600" />
                      </div>
                      <span className="text-sm text-indigo-600 hover:underline">{supplier.contact.email}</span>
                    </a>
                  )}
                  {supplier.contact.phone && (
                    <a href={`tel:${supplier.contact.phone}`} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors">
                      <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
                        <Phone size={18} className="text-emerald-600" />
                      </div>
                      <span className="text-sm text-slate-900">{supplier.contact.phone}</span>
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Info adicional */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h2 className="font-semibold text-slate-900">Información</h2>
              </div>
              <div className="p-6 space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-slate-100">
                  <span className="text-sm text-slate-500">Creado</span>
                  <span className="text-sm font-medium text-slate-900">{formatDate(supplier.createdAt)}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-100">
                  <span className="text-sm text-slate-500">Órdenes de compra</span>
                  <span className="text-sm font-medium text-slate-900">{pos.length}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm text-slate-500">Facturas</span>
                  <span className="text-sm font-medium text-slate-900">{invoices.length}</span>
                </div>
              </div>
            </div>

            {/* Zona de peligro */}
            <div className="bg-white rounded-2xl border border-red-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-red-100 bg-red-50">
                <h2 className="font-semibold text-red-900">Zona de peligro</h2>
              </div>
              <div className="p-6">
                <p className="text-sm text-slate-600 mb-4">Eliminar este proveedor de forma permanente. Esta acción no se puede deshacer.</p>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={pos.length > 0 || invoices.length > 0}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Trash2 size={16} />
                  Eliminar proveedor
                </button>
                {(pos.length > 0 || invoices.length > 0) && (
                  <p className="text-xs text-red-600 mt-2 text-center">No se puede eliminar: tiene POs o facturas asociadas</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Historial de POs y Facturas */}
        {(pos.length > 0 || invoices.length > 0) && (
          <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* POs */}
            {pos.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                  <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                    <Package size={18} className="text-indigo-600" />
                    Órdenes de compra ({pos.length})
                  </h2>
                  <Link href={`/project/${projectId}/accounting/pos`} className="text-xs text-indigo-600 hover:underline flex items-center gap-1">
                    Ver todas <ExternalLink size={12} />
                  </Link>
                </div>
                <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                  {pos.slice(0, 10).map((po) => (
                    <Link key={po.id} href={`/project/${projectId}/accounting/pos/${po.id}`} className="flex items-center justify-between px-6 py-3 hover:bg-slate-50 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900">PO-{po.number}</p>
                        <p className="text-xs text-slate-500 truncate">{po.description || "Sin descripción"}</p>
                      </div>
                      <div className="text-right ml-4">
                        <p className="text-sm font-semibold text-slate-900">{formatCurrency(po.totalAmount)} €</p>
                        {getStatusBadge(po.status)}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Facturas */}
            {invoices.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                  <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                    <Receipt size={18} className="text-emerald-600" />
                    Facturas ({invoices.length})
                  </h2>
                  <Link href={`/project/${projectId}/accounting/invoices`} className="text-xs text-indigo-600 hover:underline flex items-center gap-1">
                    Ver todas <ExternalLink size={12} />
                  </Link>
                </div>
                <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                  {invoices.slice(0, 10).map((invoice) => (
                    <Link key={invoice.id} href={`/project/${projectId}/accounting/invoices/${invoice.id}`} className="flex items-center justify-between px-6 py-3 hover:bg-slate-50 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900">{invoice.displayNumber}</p>
                        <p className="text-xs text-slate-500 truncate">{invoice.description || "Sin descripción"}</p>
                      </div>
                      <div className="text-right ml-4">
                        <p className="text-sm font-semibold text-slate-900">{formatCurrency(invoice.totalAmount)} €</p>
                        {getStatusBadge(invoice.status)}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Modal de confirmación de eliminación */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowDeleteConfirm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Trash2 size={28} className="text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 text-center mb-2">¿Eliminar proveedor?</h3>
              <p className="text-sm text-slate-600 text-center mb-6">
                Vas a eliminar a <strong>{supplier.fiscalName}</strong>. Esta acción no se puede deshacer.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl font-medium hover:bg-slate-50 transition-colors">
                  Cancelar
                </button>
                <button onClick={handleDelete} className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition-colors">
                  Sí, eliminar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
