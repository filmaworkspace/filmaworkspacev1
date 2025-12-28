"use client";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Inter } from "next/font/google";
import { useState, useEffect } from "react";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, collection, getDocs, updateDoc, deleteDoc, query, where, Timestamp } from "firebase/firestore";
import { ArrowLeft, Edit, Trash2, Mail, Phone, User, CreditCard, FileText, AlertCircle, CheckCircle, X } from "lucide-react";

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

const COUNTRIES: Record<string, string> = { ES: "España", FR: "Francia", DE: "Alemania", IT: "Italia", PT: "Portugal", UK: "Reino Unido", US: "Estados Unidos" };
const PAYMENT_METHODS: Record<string, string> = { transferencia: "Transferencia", tb30: "Transf. 30 días", tb60: "Transf. 60 días", tarjeta: "Tarjeta", efectivo: "Efectivo" };

export default function SupplierDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params?.id as string;
  const supplierId = params?.supplierId as string;

  const [loading, setLoading] = useState(true);
  const [projectName, setProjectName] = useState("");
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [posCount, setPosCount] = useState(0);
  const [invoicesCount, setInvoicesCount] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState("");
  const [canVerify, setCanVerify] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

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
      const projectDoc = await getDoc(doc(db, "projects", projectId));
      if (projectDoc.exists()) setProjectName(projectDoc.data().name || "Proyecto");

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

      const posSnap = await getDocs(query(collection(db, `projects/${projectId}/pos`), where("supplierId", "==", supplierId)));
      setPosCount(posSnap.size);

      const invSnap = await getDocs(query(collection(db, `projects/${projectId}/invoices`), where("supplierId", "==", supplierId)));
      setInvoicesCount(invSnap.size);
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
    if (posCount > 0 || invoicesCount > 0) { setErrorMessage("No se puede eliminar: tiene documentos asociados"); return; }
    if (!confirm(`¿Eliminar a ${supplier?.fiscalName}?`)) return;
    try {
      await deleteDoc(doc(db, `projects/${projectId}/suppliers`, supplierId));
      router.push(`/project/${projectId}/accounting/suppliers`);
    } catch (e: any) { setErrorMessage(e.message); }
  };

  const formatIBAN = (iban: string) => iban.replace(/\s/g, "").toUpperCase().match(/.{1,4}/g)?.join(" ") || iban;
  const formatDate = (date?: Date) => date ? new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", year: "numeric" }).format(date) : "-";

  const getCertStatus = (cert: Certificate) => {
    if (!cert.uploaded) return { label: "No subido", color: "text-red-600", bg: "bg-red-50" };
    if (cert.verified) return { label: "Verificado", color: "text-emerald-600", bg: "bg-emerald-50" };
    if (cert.expiryDate && cert.expiryDate < new Date()) return { label: "Caducado", color: "text-red-600", bg: "bg-red-50" };
    if (cert.expiryDate && cert.expiryDate < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)) return { label: "Por caducar", color: "text-amber-600", bg: "bg-amber-50" };
    return { label: "Válido", color: "text-emerald-600", bg: "bg-emerald-50" };
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

  return (
    <div className={`min-h-screen bg-white ${inter.className}`}>
      {/* Header */}
      <div className="mt-[4.5rem]">
        <div className="max-w-4xl mx-auto px-6 md:px-12 py-6">
          <div className="mb-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">
              <Link href={`/project/${projectId}/accounting/suppliers`} className="inline-flex items-center gap-1 hover:text-slate-900"><ArrowLeft size={12} />Proveedores</Link>
              <span className="text-slate-300">·</span>
              <span className="uppercase text-slate-500">{projectName}</span>
            </div>
          </div>

          <div className="flex items-start justify-between border-b border-slate-200 pb-6">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">{supplier.fiscalName}</h1>
              {supplier.commercialName && <p className="text-slate-500 mt-1">{supplier.commercialName}</p>}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleDelete} disabled={posCount > 0 || invoicesCount > 0} className="p-2.5 border border-slate-200 text-slate-500 rounded-xl hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed" title="Eliminar">
                <Trash2 size={18} />
              </button>
              <Link href={`/project/${projectId}/accounting/suppliers/${supplierId}/edit`} className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800">
                <Edit size={16} />Editar
              </Link>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-6 md:px-12 py-8">
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

        {/* Datos principales */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-slate-50 rounded-xl p-4">
            <p className="text-xs text-slate-500 mb-1">NIF/CIF</p>
            <p className="font-mono font-semibold text-slate-900">{supplier.taxId}</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-4">
            <p className="text-xs text-slate-500 mb-1">País</p>
            <p className="font-semibold text-slate-900">{COUNTRIES[supplier.country] || supplier.country}</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-4">
            <p className="text-xs text-slate-500 mb-1">Método de pago</p>
            <p className="font-semibold text-slate-900">{PAYMENT_METHODS[supplier.paymentMethod]}</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-4">
            <p className="text-xs text-slate-500 mb-1">Documentos</p>
            <p className="font-semibold text-slate-900">{posCount} POs · {invoicesCount} Fact.</p>
          </div>
        </div>

        {/* IBAN */}
        {supplier.bankAccount && (
          <div className="mb-8 p-4 bg-indigo-50 border border-indigo-100 rounded-xl">
            <p className="text-xs text-indigo-600 mb-1 flex items-center gap-1"><CreditCard size={12} />Cuenta bancaria</p>
            <p className="font-mono font-bold text-indigo-900 text-lg">{formatIBAN(supplier.bankAccount)}</p>
          </div>
        )}

        {/* Contacto */}
        {supplier.contact?.name && (
          <div className="mb-8">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Contacto</h2>
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2 text-sm text-slate-700">
                <User size={16} className="text-slate-400" />
                {supplier.contact.name}
              </div>
              {supplier.contact.email && (
                <a href={`mailto:${supplier.contact.email}`} className="flex items-center gap-2 text-sm text-indigo-600 hover:underline">
                  <Mail size={16} />
                  {supplier.contact.email}
                </a>
              )}
              {supplier.contact.phone && (
                <a href={`tel:${supplier.contact.phone}`} className="flex items-center gap-2 text-sm text-slate-700">
                  <Phone size={16} className="text-slate-400" />
                  {supplier.contact.phone}
                </a>
              )}
            </div>
          </div>
        )}

        {/* Certificados */}
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">Certificados</h2>
          <div className="space-y-3">
            {/* Titularidad */}
            <div className="flex items-center justify-between p-4 border border-slate-200 rounded-xl">
              <div className="flex items-center gap-3">
                <FileText size={18} className="text-slate-400" />
                <div>
                  <p className="text-sm font-medium text-slate-900">Titularidad bancaria</p>
                  {supplier.certificates.bankOwnership.expiryDate && (
                    <p className="text-xs text-slate-500">Caduca: {formatDate(supplier.certificates.bankOwnership.expiryDate)}</p>
                  )}
                  {supplier.certificates.bankOwnership.verified && supplier.certificates.bankOwnership.verifiedByName && (
                    <p className="text-xs text-emerald-600">Verificado por {supplier.certificates.bankOwnership.verifiedByName}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 rounded-lg text-xs font-medium ${getCertStatus(supplier.certificates.bankOwnership).bg} ${getCertStatus(supplier.certificates.bankOwnership).color}`}>
                  {getCertStatus(supplier.certificates.bankOwnership).label}
                </span>
                {canVerify && supplier.certificates.bankOwnership.uploaded && (
                  <button onClick={() => handleVerify("bankOwnership", !supplier.certificates.bankOwnership.verified)} className="text-xs text-indigo-600 hover:underline">
                    {supplier.certificates.bankOwnership.verified ? "Quitar" : "Verificar"}
                  </button>
                )}
              </div>
            </div>

            {/* Contratistas */}
            <div className="flex items-center justify-between p-4 border border-slate-200 rounded-xl">
              <div className="flex items-center gap-3">
                <FileText size={18} className="text-slate-400" />
                <div>
                  <p className="text-sm font-medium text-slate-900">Certificado contratistas</p>
                  {supplier.certificates.contractorsCertificate.expiryDate && (
                    <p className="text-xs text-slate-500">Caduca: {formatDate(supplier.certificates.contractorsCertificate.expiryDate)}</p>
                  )}
                  {supplier.certificates.contractorsCertificate.verified && supplier.certificates.contractorsCertificate.verifiedByName && (
                    <p className="text-xs text-emerald-600">Verificado por {supplier.certificates.contractorsCertificate.verifiedByName}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 rounded-lg text-xs font-medium ${getCertStatus(supplier.certificates.contractorsCertificate).bg} ${getCertStatus(supplier.certificates.contractorsCertificate).color}`}>
                  {getCertStatus(supplier.certificates.contractorsCertificate).label}
                </span>
                {canVerify && supplier.certificates.contractorsCertificate.uploaded && (
                  <button onClick={() => handleVerify("contractorsCertificate", !supplier.certificates.contractorsCertificate.verified)} className="text-xs text-indigo-600 hover:underline">
                    {supplier.certificates.contractorsCertificate.verified ? "Quitar" : "Verificar"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Dirección */}
        {supplier.address?.street && (
          <div className="text-sm text-slate-500">
            <span className="font-medium text-slate-700">Dirección:</span> {supplier.address.street} {supplier.address.number}, {supplier.address.postalCode} {supplier.address.city} {supplier.address.province && `(${supplier.address.province})`}
          </div>
        )}
      </main>
    </div>
  );
}
