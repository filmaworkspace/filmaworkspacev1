"use client";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Inter, Space_Grotesk } from "next/font/google";
import { useState, useEffect } from "react";
import { auth, db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  Timestamp,
  orderBy,
} from "firebase/firestore";
import {
  Folder,
  Plus,
  Search,
  Download,
  Edit,
  Trash2,
  X,
  FileCheck,
  FileX,
  AlertCircle,
  CheckCircle,
  Building2,
  MapPin,
  CreditCard,
  Globe,
  FileText,
  Clock,
  Eye,
  RefreshCw,
  ChevronRight,
} from "lucide-react";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "700"] });

interface Address {
  street: string;
  number: string;
  city: string;
  province: string;
  postalCode: string;
}

interface Certificate {
  url?: string;
  expiryDate?: Date;
  uploaded: boolean;
  fileName?: string;
}

interface Supplier {
  id: string;
  fiscalName: string;
  commercialName: string;
  country: string;
  taxId: string;
  address: Address;
  paymentMethod: string;
  bankAccount: string;
  certificates: {
    bankOwnership: Certificate;
    contractorsCertificate: Certificate & { aeatVerified?: boolean };
  };
  createdAt: Date;
  createdBy: string;
  hasAssignedPOs: boolean;
  hasAssignedInvoices: boolean;
}

type PaymentMethod = "transferencia" | "tb30" | "tb60" | "tarjeta" | "efectivo";

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "transferencia", label: "Transferencia bancaria" },
  { value: "tb30", label: "Transferencia 30 días" },
  { value: "tb60", label: "Transferencia 60 días" },
  { value: "tarjeta", label: "Tarjeta" },
  { value: "efectivo", label: "Efectivo" },
];

const COUNTRIES = [
  { code: "ES", name: "España" },
  { code: "FR", name: "Francia" },
  { code: "DE", name: "Alemania" },
  { code: "IT", name: "Italia" },
  { code: "PT", name: "Portugal" },
  { code: "UK", name: "Reino Unido" },
  { code: "US", name: "Estados Unidos" },
];

export default function SuppliersPage() {
  const params = useParams();
  const id = params?.id as string;
  const [projectName, setProjectName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [filteredSuppliers, setFilteredSuppliers] = useState<Supplier[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit" | "view">("create");
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [filterStatus, setFilterStatus] = useState<"all" | "valid" | "expiring" | "expired">("all");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    fiscalName: "",
    commercialName: "",
    country: "ES",
    taxId: "",
    address: {
      street: "",
      number: "",
      city: "",
      province: "",
      postalCode: "",
    },
    paymentMethod: "transferencia" as PaymentMethod,
    bankAccount: "",
  });

  const [certificates, setCertificates] = useState({
    bankOwnership: { file: null as File | null, expiryDate: "" },
    contractorsCertificate: { file: null as File | null, expiryDate: "" },
  });

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        setUserId(user.uid);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (userId && id) {
      loadData();
    }
  }, [userId, id]);

  useEffect(() => {
    filterSuppliers();
  }, [searchTerm, filterStatus, suppliers]);

  const loadData = async () => {
    try {
      setLoading(true);
      setErrorMessage("");

      const projectDoc = await getDoc(doc(db, "projects", id));
      if (!projectDoc.exists()) {
        throw new Error("El proyecto no existe");
      }
      setProjectName(projectDoc.data().name || "Proyecto");

      const suppliersRef = collection(db, `projects/${id}/suppliers`);
      const suppliersQuery = query(suppliersRef, orderBy("fiscalName", "asc"));
      const suppliersSnapshot = await getDocs(suppliersQuery);

      const suppliersData = suppliersSnapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          fiscalName: data.fiscalName || "",
          commercialName: data.commercialName || "",
          country: data.country || "ES",
          taxId: data.taxId || "",
          address: data.address || { street: "", number: "", city: "", province: "", postalCode: "" },
          paymentMethod: data.paymentMethod || "transferencia",
          bankAccount: data.bankAccount || "",
          certificates: {
            bankOwnership: {
              ...data.certificates?.bankOwnership,
              expiryDate: data.certificates?.bankOwnership?.expiryDate?.toDate(),
              uploaded: data.certificates?.bankOwnership?.uploaded || false,
            },
            contractorsCertificate: {
              ...data.certificates?.contractorsCertificate,
              expiryDate: data.certificates?.contractorsCertificate?.expiryDate?.toDate(),
              uploaded: data.certificates?.contractorsCertificate?.uploaded || false,
            },
          },
          createdAt: data.createdAt?.toDate() || new Date(),
          createdBy: data.createdBy || "",
          hasAssignedPOs: data.hasAssignedPOs || false,
          hasAssignedInvoices: data.hasAssignedInvoices || false,
        };
      }) as Supplier[];

      setSuppliers(suppliersData);
    } catch (error: any) {
      setErrorMessage(`Error cargando datos: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const filterSuppliers = () => {
    let filtered = [...suppliers];

    if (searchTerm) {
      filtered = filtered.filter(
        (s) =>
          s.fiscalName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          s.commercialName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          s.taxId.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (filterStatus !== "all") {
      filtered = filtered.filter((s) => getCertificateStatus(s) === filterStatus);
    }

    setFilteredSuppliers(filtered);
  };

  const getCertificateStatus = (supplier: Supplier): "valid" | "expiring" | "expired" => {
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const bankCert = supplier.certificates.bankOwnership;
    const contractorCert = supplier.certificates.contractorsCertificate;

    if (!bankCert.uploaded || !contractorCert.uploaded) return "expired";
    if ((bankCert.expiryDate && bankCert.expiryDate < now) || (contractorCert.expiryDate && contractorCert.expiryDate < now)) return "expired";
    if ((bankCert.expiryDate && bankCert.expiryDate < thirtyDaysFromNow) || (contractorCert.expiryDate && contractorCert.expiryDate < thirtyDaysFromNow)) return "expiring";

    return "valid";
  };

  const validateForm = () => {
    if (!formData.fiscalName.trim()) {
      setErrorMessage("El nombre fiscal es obligatorio");
      return false;
    }
    if (!formData.taxId.trim()) {
      setErrorMessage("El NIF/CIF es obligatorio");
      return false;
    }
    return true;
  };

  const handleCreateSupplier = async () => {
    if (!validateForm()) return;

    setSaving(true);
    setErrorMessage("");

    try {
      const newSupplier = {
        fiscalName: formData.fiscalName.trim(),
        commercialName: formData.commercialName.trim(),
        country: formData.country,
        taxId: formData.taxId.trim().toUpperCase(),
        address: {
          street: formData.address.street.trim(),
          number: formData.address.number.trim(),
          city: formData.address.city.trim(),
          province: formData.address.province.trim(),
          postalCode: formData.address.postalCode.trim(),
        },
        paymentMethod: formData.paymentMethod,
        bankAccount: formData.bankAccount.trim(),
        certificates: {
          bankOwnership: {
            uploaded: !!certificates.bankOwnership.file,
            expiryDate: certificates.bankOwnership.expiryDate ? Timestamp.fromDate(new Date(certificates.bankOwnership.expiryDate)) : null,
            fileName: certificates.bankOwnership.file?.name || "",
          },
          contractorsCertificate: {
            uploaded: !!certificates.contractorsCertificate.file,
            expiryDate: certificates.contractorsCertificate.expiryDate ? Timestamp.fromDate(new Date(certificates.contractorsCertificate.expiryDate)) : null,
            fileName: certificates.contractorsCertificate.file?.name || "",
            aeatVerified: false,
          },
        },
        createdAt: Timestamp.now(),
        createdBy: userId || "",
        hasAssignedPOs: false,
        hasAssignedInvoices: false,
      };

      await addDoc(collection(db, `projects/${id}/suppliers`), newSupplier);

      setSuccessMessage("Proveedor creado correctamente");
      setTimeout(() => setSuccessMessage(""), 3000);

      resetForm();
      setShowModal(false);
      await loadData();
    } catch (error: any) {
      setErrorMessage(`Error creando proveedor: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateSupplier = async () => {
    if (!selectedSupplier) return;
    if (!validateForm()) return;

    setSaving(true);
    setErrorMessage("");

    try {
      const updatedData = {
        fiscalName: formData.fiscalName.trim(),
        commercialName: formData.commercialName.trim(),
        country: formData.country,
        taxId: formData.taxId.trim().toUpperCase(),
        address: {
          street: formData.address.street.trim(),
          number: formData.address.number.trim(),
          city: formData.address.city.trim(),
          province: formData.address.province.trim(),
          postalCode: formData.address.postalCode.trim(),
        },
        paymentMethod: formData.paymentMethod,
        bankAccount: formData.bankAccount.trim(),
        certificates: {
          bankOwnership: {
            ...selectedSupplier.certificates.bankOwnership,
            ...(certificates.bankOwnership.file && { uploaded: true, fileName: certificates.bankOwnership.file.name }),
            ...(certificates.bankOwnership.expiryDate && { expiryDate: Timestamp.fromDate(new Date(certificates.bankOwnership.expiryDate)) }),
          },
          contractorsCertificate: {
            ...selectedSupplier.certificates.contractorsCertificate,
            ...(certificates.contractorsCertificate.file && { uploaded: true, fileName: certificates.contractorsCertificate.file.name }),
            ...(certificates.contractorsCertificate.expiryDate && { expiryDate: Timestamp.fromDate(new Date(certificates.contractorsCertificate.expiryDate)) }),
          },
        },
      };

      await updateDoc(doc(db, `projects/${id}/suppliers`, selectedSupplier.id), updatedData);

      setSuccessMessage("Proveedor actualizado correctamente");
      setTimeout(() => setSuccessMessage(""), 3000);

      resetForm();
      setShowModal(false);
      await loadData();
    } catch (error: any) {
      setErrorMessage(`Error actualizando proveedor: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSupplier = async (supplierId: string) => {
    const supplier = suppliers.find((s) => s.id === supplierId);

    if (supplier?.hasAssignedPOs || supplier?.hasAssignedInvoices) {
      setErrorMessage("No se puede eliminar un proveedor con POs o facturas asignadas");
      setTimeout(() => setErrorMessage(""), 5000);
      return;
    }

    if (!confirm(`¿Eliminar a ${supplier?.fiscalName}?`)) return;

    try {
      await deleteDoc(doc(db, `projects/${id}/suppliers`, supplierId));
      setSuccessMessage("Proveedor eliminado");
      setTimeout(() => setSuccessMessage(""), 3000);
      await loadData();
    } catch (error: any) {
      setErrorMessage(`Error eliminando proveedor: ${error.message}`);
    }
  };

  const resetForm = () => {
    setFormData({
      fiscalName: "",
      commercialName: "",
      country: "ES",
      taxId: "",
      address: { street: "", number: "", city: "", province: "", postalCode: "" },
      paymentMethod: "transferencia",
      bankAccount: "",
    });
    setCertificates({
      bankOwnership: { file: null, expiryDate: "" },
      contractorsCertificate: { file: null, expiryDate: "" },
    });
    setSelectedSupplier(null);
    setErrorMessage("");
  };

  const openCreateModal = () => {
    resetForm();
    setModalMode("create");
    setShowModal(true);
  };

  const openEditModal = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setFormData({
      fiscalName: supplier.fiscalName,
      commercialName: supplier.commercialName,
      country: supplier.country,
      taxId: supplier.taxId,
      address: supplier.address,
      paymentMethod: supplier.paymentMethod as PaymentMethod,
      bankAccount: supplier.bankAccount,
    });
    setModalMode("edit");
    setShowModal(true);
  };

  const openViewModal = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setModalMode("view");
    setShowModal(true);
  };

  const getCertificateBadge = (cert: Certificate) => {
    if (!cert.uploaded) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-red-100 text-red-700">
          <FileX size={12} />
          No subido
        </span>
      );
    }

    if (!cert.expiryDate) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-blue-100 text-blue-700">
          <FileCheck size={12} />
          Subido
        </span>
      );
    }

    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    if (cert.expiryDate < now) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-red-100 text-red-700">
          <AlertCircle size={12} />
          Caducado
        </span>
      );
    }

    if (cert.expiryDate < thirtyDaysFromNow) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-amber-100 text-amber-700">
          <Clock size={12} />
          Por caducar
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-emerald-100 text-emerald-700">
        <CheckCircle size={12} />
        Válido
      </span>
    );
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      valid: "bg-emerald-100 text-emerald-700",
      expiring: "bg-amber-100 text-amber-700",
      expired: "bg-red-100 text-red-700",
    };
    const labels = {
      valid: "Válido",
      expiring: "Por caducar",
      expired: "Acción requerida",
    };
    return (
      <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${styles[status as keyof typeof styles] || ""}`}>
        {labels[status as keyof typeof labels] || status}
      </span>
    );
  };

  const exportSuppliers = () => {
    const rows = [["NOMBRE FISCAL", "NOMBRE COMERCIAL", "PAÍS", "NIF/CIF", "MÉTODO PAGO", "CUENTA BANCARIA"]];
    suppliers.forEach((supplier) => {
      rows.push([supplier.fiscalName, supplier.commercialName, supplier.country, supplier.taxId, supplier.paymentMethod, supplier.bankAccount]);
    });
    const csvContent = rows.map((row) => row.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.setAttribute("href", URL.createObjectURL(blob));
    link.setAttribute("download", `proveedores_${projectName}_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className={`flex flex-col min-h-screen bg-white ${inter.className}`}>
        <main className="pt-28 pb-16 px-6 md:px-12 flex-grow flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-slate-200 border-t-slate-700 rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-slate-600 text-sm font-medium">Cargando...</p>
          </div>
        </main>
      </div>
    );
  }

  const validCount = suppliers.filter((s) => getCertificateStatus(s) === "valid").length;
  const expiringCount = suppliers.filter((s) => getCertificateStatus(s) === "expiring").length;
  const expiredCount = suppliers.filter((s) => getCertificateStatus(s) === "expired").length;

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
            <button
              onClick={loadData}
              className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white/80 hover:text-white rounded-lg text-sm font-medium transition-colors border border-white/10"
            >
              <RefreshCw size={14} />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white/10 backdrop-blur rounded-xl flex items-center justify-center">
                <Building2 size={24} className="text-white" />
              </div>
              <div>
                <h1 className={`text-3xl font-semibold tracking-tight ${spaceGrotesk.className}`}>Proveedores</h1>
                <p className="text-slate-400 text-sm">Gestión de proveedores del proyecto</p>
              </div>
            </div>
            <button
              onClick={openCreateModal}
              className="flex items-center gap-2 px-5 py-2.5 bg-white text-slate-900 rounded-xl font-medium transition-all hover:bg-slate-100 shadow-lg"
            >
              <Plus size={18} />
              Añadir proveedor
            </button>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
            <div className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <Building2 size={18} className="text-blue-400" />
                <span className="text-2xl font-bold">{suppliers.length}</span>
              </div>
              <p className="text-sm text-slate-400">Total proveedores</p>
            </div>
            <div className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <CheckCircle size={18} className="text-emerald-400" />
                <span className="text-2xl font-bold">{validCount}</span>
              </div>
              <p className="text-sm text-slate-400">Certificados válidos</p>
            </div>
            <div className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <Clock size={18} className="text-amber-400" />
                <span className="text-2xl font-bold">{expiringCount}</span>
              </div>
              <p className="text-sm text-slate-400">Próximos a caducar</p>
            </div>
            <div className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <AlertCircle size={18} className="text-red-400" />
                <span className="text-2xl font-bold">{expiredCount}</span>
              </div>
              <p className="text-sm text-slate-400">Acción requerida</p>
            </div>
          </div>
        </div>
      </div>

      <main className="pb-16 px-6 md:px-12 flex-grow -mt-6">
        <div className="max-w-7xl mx-auto">
          {/* Messages */}
          {errorMessage && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-700">
              <AlertCircle size={20} />
              <span className="flex-1">{errorMessage}</span>
              <button onClick={() => setErrorMessage("")}><X size={16} /></button>
            </div>
          )}

          {successMessage && (
            <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-emerald-700">
              <CheckCircle size={20} />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Filters */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-6 shadow-sm">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar por nombre o NIF..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500 bg-slate-50"
                />
              </div>

              <div className="flex gap-2">
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as any)}
                  className="px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500 bg-slate-50"
                >
                  <option value="all">Todos los estados</option>
                  <option value="valid">Certificados válidos</option>
                  <option value="expiring">Próximos a caducar</option>
                  <option value="expired">Acción requerida</option>
                </select>

                <button
                  onClick={exportSuppliers}
                  className="px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors flex items-center gap-2 font-medium"
                >
                  <Download size={16} />
                  Exportar
                </button>
              </div>
            </div>
          </div>

          {/* Suppliers List */}
          {filteredSuppliers.length === 0 ? (
            <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl p-12 text-center">
              <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Building2 size={32} className="text-slate-400" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-2">
                {searchTerm || filterStatus !== "all" ? "No se encontraron proveedores" : "No hay proveedores registrados"}
              </h3>
              <p className="text-slate-500 mb-6">
                {searchTerm || filterStatus !== "all" ? "Intenta ajustar los filtros" : "Añade tu primer proveedor al proyecto"}
              </p>
              {!searchTerm && filterStatus === "all" && (
                <button
                  onClick={openCreateModal}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-medium transition-colors"
                >
                  <Plus size={18} />
                  Añadir proveedor
                </button>
              )}
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Proveedor</th>
                      <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase">País / NIF</th>
                      <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Método pago</th>
                      <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Cert. Bancario</th>
                      <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Cert. Contratista</th>
                      <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Estado</th>
                      <th className="text-right px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredSuppliers.map((supplier) => {
                      const status = getCertificateStatus(supplier);
                      return (
                        <tr key={supplier.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4">
                            <div>
                              <p className="font-medium text-slate-900">{supplier.fiscalName}</p>
                              {supplier.commercialName && (
                                <p className="text-sm text-slate-500">{supplier.commercialName}</p>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <Globe size={14} className="text-slate-400" />
                              <div>
                                <p className="text-sm font-medium text-slate-900">{supplier.country}</p>
                                <p className="text-xs text-slate-500">{supplier.taxId}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-blue-50 text-blue-700">
                              <CreditCard size={12} />
                              {PAYMENT_METHODS.find((pm) => pm.value === supplier.paymentMethod)?.label || supplier.paymentMethod}
                            </span>
                          </td>
                          <td className="px-6 py-4">{getCertificateBadge(supplier.certificates.bankOwnership)}</td>
                          <td className="px-6 py-4">{getCertificateBadge(supplier.certificates.contractorsCertificate)}</td>
                          <td className="px-6 py-4">{getStatusBadge(status)}</td>
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => openViewModal(supplier)}
                                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                                title="Ver detalles"
                              >
                                <Eye size={16} />
                              </button>
                              <button
                                onClick={() => openEditModal(supplier)}
                                className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="Editar"
                              >
                                <Edit size={16} />
                              </button>
                              <button
                                onClick={() => handleDeleteSupplier(supplier.id)}
                                disabled={supplier.hasAssignedPOs || supplier.hasAssignedInvoices}
                                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title={supplier.hasAssignedPOs || supplier.hasAssignedInvoices ? "Tiene documentos asignados" : "Eliminar"}
                              >
                                <Trash2 size={16} />
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
        </div>
      </main>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="bg-slate-900 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">
                {modalMode === "create" && "Nuevo proveedor"}
                {modalMode === "edit" && "Editar proveedor"}
                {modalMode === "view" && "Detalles del proveedor"}
              </h2>
              <button onClick={() => { setShowModal(false); resetForm(); }} className="text-white/60 hover:text-white p-2 hover:bg-white/10 rounded-lg transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
              {errorMessage && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-2">
                  <AlertCircle size={16} />
                  {errorMessage}
                </div>
              )}

              <div className="space-y-6">
                {/* Información básica */}
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2 uppercase tracking-wider">
                    <Building2 size={16} className="text-slate-500" />
                    Información básica
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Nombre fiscal *</label>
                      <input
                        type="text"
                        value={modalMode === "view" ? selectedSupplier?.fiscalName : formData.fiscalName}
                        onChange={(e) => setFormData({ ...formData, fiscalName: e.target.value })}
                        disabled={modalMode === "view"}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500 disabled:bg-slate-50"
                        placeholder="Nombre Fiscal S.L."
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Nombre comercial</label>
                      <input
                        type="text"
                        value={modalMode === "view" ? selectedSupplier?.commercialName : formData.commercialName}
                        onChange={(e) => setFormData({ ...formData, commercialName: e.target.value })}
                        disabled={modalMode === "view"}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500 disabled:bg-slate-50"
                        placeholder="Nombre Comercial"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">País</label>
                      <select
                        value={modalMode === "view" ? selectedSupplier?.country : formData.country}
                        onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                        disabled={modalMode === "view"}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500 disabled:bg-slate-50"
                      >
                        {COUNTRIES.map((country) => (
                          <option key={country.code} value={country.code}>{country.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">NIF/CIF *</label>
                      <input
                        type="text"
                        value={modalMode === "view" ? selectedSupplier?.taxId : formData.taxId}
                        onChange={(e) => setFormData({ ...formData, taxId: e.target.value })}
                        disabled={modalMode === "view"}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500 disabled:bg-slate-50"
                        placeholder="B12345678"
                      />
                    </div>
                  </div>
                </div>

                {/* Dirección */}
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2 uppercase tracking-wider">
                    <MapPin size={16} className="text-slate-500" />
                    Dirección
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-2">Calle</label>
                      <input
                        type="text"
                        value={modalMode === "view" ? selectedSupplier?.address?.street : formData.address.street}
                        onChange={(e) => setFormData({ ...formData, address: { ...formData.address, street: e.target.value } })}
                        disabled={modalMode === "view"}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500 disabled:bg-slate-50"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Número</label>
                      <input
                        type="text"
                        value={modalMode === "view" ? selectedSupplier?.address?.number : formData.address.number}
                        onChange={(e) => setFormData({ ...formData, address: { ...formData.address, number: e.target.value } })}
                        disabled={modalMode === "view"}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500 disabled:bg-slate-50"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Población</label>
                      <input
                        type="text"
                        value={modalMode === "view" ? selectedSupplier?.address?.city : formData.address.city}
                        onChange={(e) => setFormData({ ...formData, address: { ...formData.address, city: e.target.value } })}
                        disabled={modalMode === "view"}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500 disabled:bg-slate-50"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Provincia</label>
                      <input
                        type="text"
                        value={modalMode === "view" ? selectedSupplier?.address?.province : formData.address.province}
                        onChange={(e) => setFormData({ ...formData, address: { ...formData.address, province: e.target.value } })}
                        disabled={modalMode === "view"}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500 disabled:bg-slate-50"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Código postal</label>
                      <input
                        type="text"
                        value={modalMode === "view" ? selectedSupplier?.address?.postalCode : formData.address.postalCode}
                        onChange={(e) => setFormData({ ...formData, address: { ...formData.address, postalCode: e.target.value } })}
                        disabled={modalMode === "view"}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500 disabled:bg-slate-50"
                      />
                    </div>
                  </div>
                </div>

                {/* Información de pago */}
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2 uppercase tracking-wider">
                    <CreditCard size={16} className="text-slate-500" />
                    Información de pago
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Método de pago</label>
                      <select
                        value={modalMode === "view" ? selectedSupplier?.paymentMethod : formData.paymentMethod}
                        onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value as PaymentMethod })}
                        disabled={modalMode === "view"}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500 disabled:bg-slate-50"
                      >
                        {PAYMENT_METHODS.map((method) => (
                          <option key={method.value} value={method.value}>{method.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Cuenta bancaria (IBAN)</label>
                      <input
                        type="text"
                        value={modalMode === "view" ? selectedSupplier?.bankAccount : formData.bankAccount}
                        onChange={(e) => setFormData({ ...formData, bankAccount: e.target.value })}
                        disabled={modalMode === "view"}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500 disabled:bg-slate-50"
                        placeholder="ES91 2100 0418 4502 0005 1332"
                      />
                    </div>
                  </div>
                </div>

                {/* Certificados */}
                {modalMode !== "view" && (
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2 uppercase tracking-wider">
                      <FileText size={16} className="text-slate-500" />
                      Certificados
                    </h3>
                    <div className="space-y-4">
                      <div className="border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-colors">
                        <div className="flex items-start gap-4">
                          <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
                            <FileCheck size={20} className="text-indigo-600" />
                          </div>
                          <div className="flex-1">
                            <h4 className="font-medium text-slate-900 mb-1">Certificado de titularidad bancaria</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                              <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">Archivo</label>
                                <input
                                  type="file"
                                  onChange={(e) => setCertificates({ ...certificates, bankOwnership: { ...certificates.bankOwnership, file: e.target.files?.[0] || null } })}
                                  className="w-full text-sm"
                                  accept=".pdf,.jpg,.jpeg,.png"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">Fecha caducidad</label>
                                <input
                                  type="date"
                                  value={certificates.bankOwnership.expiryDate}
                                  onChange={(e) => setCertificates({ ...certificates, bankOwnership: { ...certificates.bankOwnership, expiryDate: e.target.value } })}
                                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-colors">
                        <div className="flex items-start gap-4">
                          <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
                            <FileCheck size={20} className="text-emerald-600" />
                          </div>
                          <div className="flex-1">
                            <h4 className="font-medium text-slate-900 mb-1">Certificado de contratistas</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                              <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">Archivo</label>
                                <input
                                  type="file"
                                  onChange={(e) => setCertificates({ ...certificates, contractorsCertificate: { ...certificates.contractorsCertificate, file: e.target.files?.[0] || null } })}
                                  className="w-full text-sm"
                                  accept=".pdf,.jpg,.jpeg,.png"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">Fecha caducidad</label>
                                <input
                                  type="date"
                                  value={certificates.contractorsCertificate.expiryDate}
                                  onChange={(e) => setCertificates({ ...certificates, contractorsCertificate: { ...certificates.contractorsCertificate, expiryDate: e.target.value } })}
                                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Ver certificados en modo view */}
                {modalMode === "view" && selectedSupplier && (
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2 uppercase tracking-wider">
                      <FileText size={16} className="text-slate-500" />
                      Estado de certificados
                    </h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                        <div>
                          <p className="font-medium text-slate-900">Certificado de titularidad bancaria</p>
                          {selectedSupplier.certificates.bankOwnership.expiryDate && (
                            <p className="text-sm text-slate-500">
                              Caduca: {new Intl.DateTimeFormat("es-ES").format(selectedSupplier.certificates.bankOwnership.expiryDate)}
                            </p>
                          )}
                        </div>
                        {getCertificateBadge(selectedSupplier.certificates.bankOwnership)}
                      </div>
                      <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                        <div>
                          <p className="font-medium text-slate-900">Certificado de contratistas</p>
                          {selectedSupplier.certificates.contractorsCertificate.expiryDate && (
                            <p className="text-sm text-slate-500">
                              Caduca: {new Intl.DateTimeFormat("es-ES").format(selectedSupplier.certificates.contractorsCertificate.expiryDate)}
                            </p>
                          )}
                        </div>
                        {getCertificateBadge(selectedSupplier.certificates.contractorsCertificate)}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="mt-6 flex justify-end gap-3 pt-6 border-t border-slate-200">
                <button
                  onClick={() => { setShowModal(false); resetForm(); }}
                  className="px-5 py-2.5 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 font-medium transition-colors"
                >
                  {modalMode === "view" ? "Cerrar" : "Cancelar"}
                </button>
                {modalMode !== "view" && (
                  <button
                    onClick={modalMode === "create" ? handleCreateSupplier : handleUpdateSupplier}
                    disabled={saving}
                    className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {saving && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                    {modalMode === "create" ? "Crear proveedor" : "Guardar cambios"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


