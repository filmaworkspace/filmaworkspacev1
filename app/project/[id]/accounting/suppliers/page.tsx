"use client";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Inter } from "next/font/google";
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
  where,
  Timestamp,
} from "firebase/firestore";
import {
  Folder,
  Users,
  Plus,
  Search,
  Filter,
  Download,
  Upload,
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
  Calendar,
  Globe,
  Hash,
  FileText,
  Clock,
  Eye,
} from "lucide-react";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });

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
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [filteredSuppliers, setFilteredSuppliers] = useState<Supplier[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit" | "view">("create");
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [filterStatus, setFilterStatus] = useState<"all" | "valid" | "expiring" | "expired">("all");

  // Form states
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
    loadData();
  }, [id]);

  useEffect(() => {
    filterSuppliers();
  }, [searchTerm, filterStatus, suppliers]);

  const loadData = async () => {
    try {
      setLoading(true);
      const projectDoc = await getDoc(doc(db, "projects", id));
      if (projectDoc.exists()) {
        setProjectName(projectDoc.data().name || "Proyecto");
      }

      const suppliersSnapshot = await getDocs(
        collection(db, `projects/${id}/suppliers`)
      );
      const suppliersData = suppliersSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate(),
        certificates: {
          bankOwnership: {
            ...doc.data().certificates?.bankOwnership,
            expiryDate: doc.data().certificates?.bankOwnership?.expiryDate?.toDate(),
          },
          contractorsCertificate: {
            ...doc.data().certificates?.contractorsCertificate,
            expiryDate: doc.data().certificates?.contractorsCertificate?.expiryDate?.toDate(),
          },
        },
      })) as Supplier[];

      setSuppliers(suppliersData);
    } catch (error) {
      console.error("Error cargando datos:", error);
    } finally {
      setLoading(false);
    }
  };

  const filterSuppliers = () => {
    let filtered = [...suppliers];

    // Filtro de búsqueda
    if (searchTerm) {
      filtered = filtered.filter(
        (s) =>
          s.fiscalName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          s.commercialName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          s.taxId.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filtro de estado de certificados
    if (filterStatus !== "all") {
      filtered = filtered.filter((s) => {
        const status = getCertificateStatus(s);
        return status === filterStatus;
      });
    }

    setFilteredSuppliers(filtered);
  };

  const getCertificateStatus = (supplier: Supplier): "valid" | "expiring" | "expired" => {
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const bankCert = supplier.certificates.bankOwnership;
    const contractorCert = supplier.certificates.contractorsCertificate;

    // Si algún certificado no está subido
    if (!bankCert.uploaded || !contractorCert.uploaded) {
      return "expired";
    }

    // Si alguno está caducado
    if (
      (bankCert.expiryDate && bankCert.expiryDate < now) ||
      (contractorCert.expiryDate && contractorCert.expiryDate < now)
    ) {
      return "expired";
    }

    // Si alguno está próximo a caducar
    if (
      (bankCert.expiryDate && bankCert.expiryDate < thirtyDaysFromNow) ||
      (contractorCert.expiryDate && contractorCert.expiryDate < thirtyDaysFromNow)
    ) {
      return "expiring";
    }

    return "valid";
  };

  const handleCreateSupplier = async () => {
    try {
      const newSupplier = {
        ...formData,
        certificates: {
          bankOwnership: {
            uploaded: !!certificates.bankOwnership.file,
            expiryDate: certificates.bankOwnership.expiryDate
              ? Timestamp.fromDate(new Date(certificates.bankOwnership.expiryDate))
              : null,
            fileName: certificates.bankOwnership.file?.name || "",
          },
          contractorsCertificate: {
            uploaded: !!certificates.contractorsCertificate.file,
            expiryDate: certificates.contractorsCertificate.expiryDate
              ? Timestamp.fromDate(new Date(certificates.contractorsCertificate.expiryDate))
              : null,
            fileName: certificates.contractorsCertificate.file?.name || "",
            aeatVerified: false,
          },
        },
        createdAt: Timestamp.now(),
        createdBy: auth.currentUser?.uid || "",
        hasAssignedPOs: false,
        hasAssignedInvoices: false,
      };

      await addDoc(collection(db, `projects/${id}/suppliers`), newSupplier);
      
      // Reset form
      resetForm();
      setShowModal(false);
      loadData();
    } catch (error) {
      console.error("Error creando proveedor:", error);
    }
  };

  const handleUpdateSupplier = async () => {
    if (!selectedSupplier) return;

    try {
      const updatedData = {
        ...formData,
        certificates: {
          bankOwnership: {
            ...selectedSupplier.certificates.bankOwnership,
            ...(certificates.bankOwnership.file && {
              uploaded: true,
              fileName: certificates.bankOwnership.file.name,
            }),
            ...(certificates.bankOwnership.expiryDate && {
              expiryDate: Timestamp.fromDate(new Date(certificates.bankOwnership.expiryDate)),
            }),
          },
          contractorsCertificate: {
            ...selectedSupplier.certificates.contractorsCertificate,
            ...(certificates.contractorsCertificate.file && {
              uploaded: true,
              fileName: certificates.contractorsCertificate.file.name,
            }),
            ...(certificates.contractorsCertificate.expiryDate && {
              expiryDate: Timestamp.fromDate(new Date(certificates.contractorsCertificate.expiryDate)),
            }),
          },
        },
      };

      await updateDoc(
        doc(db, `projects/${id}/suppliers`, selectedSupplier.id),
        updatedData
      );

      resetForm();
      setShowModal(false);
      loadData();
    } catch (error) {
      console.error("Error actualizando proveedor:", error);
    }
  };

  const handleDeleteSupplier = async (supplierId: string) => {
    const supplier = suppliers.find((s) => s.id === supplierId);
    
    if (supplier?.hasAssignedPOs || supplier?.hasAssignedInvoices) {
      alert("No se puede eliminar un proveedor con POs o facturas asignadas");
      return;
    }

    if (confirm("¿Estás seguro de que quieres eliminar este proveedor?")) {
      try {
        await deleteDoc(doc(db, `projects/${id}/suppliers`, supplierId));
        loadData();
      } catch (error) {
        console.error("Error eliminando proveedor:", error);
      }
    }
  };

  const resetForm = () => {
    setFormData({
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
      paymentMethod: "transferencia",
      bankAccount: "",
    });
    setCertificates({
      bankOwnership: { file: null, expiryDate: "" },
      contractorsCertificate: { file: null, expiryDate: "" },
    });
    setSelectedSupplier(null);
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
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-red-100 text-red-700 border border-red-200">
          <FileX size={12} />
          No subido
        </span>
      );
    }

    if (!cert.expiryDate) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-700 border border-blue-200">
          <FileCheck size={12} />
          Subido
        </span>
      );
    }

    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    if (cert.expiryDate < now) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-red-100 text-red-700 border border-red-200">
          <AlertCircle size={12} />
          Caducado
        </span>
      );
    }

    if (cert.expiryDate < thirtyDaysFromNow) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200">
          <Clock size={12} />
          Próximo a caducar
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-emerald-100 text-emerald-700 border border-emerald-200">
        <CheckCircle size={12} />
        Válido
      </span>
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "valid":
        return "bg-emerald-100 text-emerald-700 border-emerald-200";
      case "expiring":
        return "bg-amber-100 text-amber-700 border-amber-200";
      case "expired":
        return "bg-red-100 text-red-700 border-red-200";
      default:
        return "bg-slate-100 text-slate-700 border-slate-200";
    }
  };

  if (loading) {
    return (
      <div className={`flex flex-col min-h-screen bg-white ${inter.className}`}>
        <main className="pt-28 pb-16 px-6 md:px-12 flex-grow flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-slate-600 text-sm font-medium">Cargando...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={`flex flex-col min-h-screen bg-white ${inter.className}`}>
      {/* Banner superior */}
      <div className="mt-[4.5rem] bg-gradient-to-r from-indigo-50 to-indigo-100 border-y border-indigo-200 px-6 md:px-12 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-lg">
            <Folder size={16} className="text-white" />
          </div>
          <h1 className="text-sm font-medium text-indigo-900 tracking-tight">
            {projectName}
          </h1>
        </div>
        <Link
          href="/dashboard"
          className="text-indigo-600 hover:text-indigo-900 transition-colors text-sm font-medium"
        >
          Volver a proyectos
        </Link>
      </div>

      <main className="pb-16 px-6 md:px-12 flex-grow mt-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <header className="mb-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 p-3 rounded-xl shadow-lg">
                  <Building2 size={28} className="text-white" />
                </div>
                <div>
                  <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight">
                    Proveedores
                  </h1>
                  <p className="text-slate-600 text-sm mt-1">
                    Gestión de proveedores del proyecto
                  </p>
                </div>
              </div>
              <button
                onClick={openCreateModal}
                className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-all shadow-lg hover:shadow-xl hover:scale-105"
              >
                <Plus size={20} />
                Añadir proveedor
              </button>
            </div>
          </header>

          {/* Estadísticas */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-blue-700 font-medium mb-1">
                    Total proveedores
                  </p>
                  <p className="text-3xl font-bold text-blue-900">
                    {suppliers.length}
                  </p>
                </div>
                <div className="bg-blue-600 p-3 rounded-lg">
                  <Building2 size={24} className="text-white" />
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-emerald-700 font-medium mb-1">
                    Certificados válidos
                  </p>
                  <p className="text-3xl font-bold text-emerald-900">
                    {suppliers.filter((s) => getCertificateStatus(s) === "valid").length}
                  </p>
                </div>
                <div className="bg-emerald-600 p-3 rounded-lg">
                  <CheckCircle size={24} className="text-white" />
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-amber-700 font-medium mb-1">
                    Próximos a caducar
                  </p>
                  <p className="text-3xl font-bold text-amber-900">
                    {suppliers.filter((s) => getCertificateStatus(s) === "expiring").length}
                  </p>
                </div>
                <div className="bg-amber-600 p-3 rounded-lg">
                  <Clock size={24} className="text-white" />
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-red-50 to-rose-50 border border-red-200 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-red-700 font-medium mb-1">
                    Certificados caducados
                  </p>
                  <p className="text-3xl font-bold text-red-900">
                    {suppliers.filter((s) => getCertificateStatus(s) === "expired").length}
                  </p>
                </div>
                <div className="bg-red-600 p-3 rounded-lg">
                  <AlertCircle size={24} className="text-white" />
                </div>
              </div>
            </div>
          </div>

          {/* Barra de búsqueda y filtros */}
          <div className="bg-white border-2 border-slate-200 rounded-xl p-4 mb-6 shadow-sm">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search
                  size={20}
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  placeholder="Buscar por nombre fiscal, comercial o NIF..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div className="flex gap-2">
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as any)}
                  className="px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  <option value="all">Todos los estados</option>
                  <option value="valid">Certificados válidos</option>
                  <option value="expiring">Próximos a caducar</option>
                  <option value="expired">Caducados/Sin certificados</option>
                </select>

                <button className="px-4 py-2.5 border-2 border-indigo-600 text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors flex items-center gap-2 font-medium">
                  <Download size={18} />
                  Exportar
                </button>
              </div>
            </div>
          </div>

          {/* Tabla de proveedores */}
          {filteredSuppliers.length === 0 ? (
            <div className="bg-slate-50 border-2 border-dashed border-slate-300 rounded-2xl p-12 text-center">
              <Building2 size={64} className="text-slate-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-slate-900 mb-2">
                {searchTerm || filterStatus !== "all"
                  ? "No se encontraron proveedores"
                  : "No hay proveedores registrados"}
              </h3>
              <p className="text-slate-600 mb-6">
                {searchTerm || filterStatus !== "all"
                  ? "Intenta ajustar los filtros de búsqueda"
                  : "Comienza añadiendo tu primer proveedor al proyecto"}
              </p>
              {!searchTerm && filterStatus === "all" && (
                <button
                  onClick={openCreateModal}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-all shadow-lg"
                >
                  <Plus size={20} />
                  Añadir primer proveedor
                </button>
              )}
            </div>
          ) : (
            <div className="bg-white border-2 border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b-2 border-slate-200">
                    <tr>
                      <th className="text-left px-6 py-4 text-xs font-semibold text-slate-700 uppercase tracking-wider">
                        Proveedor
                      </th>
                      <th className="text-left px-6 py-4 text-xs font-semibold text-slate-700 uppercase tracking-wider">
                        País / NIF
                      </th>
                      <th className="text-left px-6 py-4 text-xs font-semibold text-slate-700 uppercase tracking-wider">
                        Método de pago
                      </th>
                      <th className="text-left px-6 py-4 text-xs font-semibold text-slate-700 uppercase tracking-wider">
                        Cert. Bancario
                      </th>
                      <th className="text-left px-6 py-4 text-xs font-semibold text-slate-700 uppercase tracking-wider">
                        Cert. Contratista
                      </th>
                      <th className="text-left px-6 py-4 text-xs font-semibold text-slate-700 uppercase tracking-wider">
                        Estado
                      </th>
                      <th className="text-right px-6 py-4 text-xs font-semibold text-slate-700 uppercase tracking-wider">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredSuppliers.map((supplier) => {
                      const status = getCertificateStatus(supplier);
                      return (
                        <tr
                          key={supplier.id}
                          className="hover:bg-slate-50 transition-colors"
                        >
                          <td className="px-6 py-4">
                            <div>
                              <p className="font-semibold text-slate-900">
                                {supplier.fiscalName}
                              </p>
                              <p className="text-sm text-slate-600">
                                {supplier.commercialName}
                              </p>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <Globe size={16} className="text-slate-400" />
                              <div>
                                <p className="text-sm font-medium text-slate-900">
                                  {supplier.country}
                                </p>
                                <p className="text-sm text-slate-600">
                                  {supplier.taxId}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700 border border-blue-200">
                              <CreditCard size={12} />
                              {
                                PAYMENT_METHODS.find(
                                  (pm) => pm.value === supplier.paymentMethod
                                )?.label
                              }
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            {getCertificateBadge(supplier.certificates.bankOwnership)}
                          </td>
                          <td className="px-6 py-4">
                            {getCertificateBadge(
                              supplier.certificates.contractorsCertificate
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={`inline-flex px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(
                                status
                              )}`}
                            >
                              {status === "valid" && "Válido"}
                              {status === "expiring" && "Por caducar"}
                              {status === "expired" && "Acción requerida"}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => openViewModal(supplier)}
                                className="p-2 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                title="Ver detalles"
                              >
                                <Eye size={18} />
                              </button>
                              <button
                                onClick={() => openEditModal(supplier)}
                                className="p-2 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="Editar"
                              >
                                <Edit size={18} />
                              </button>
                              <button
                                onClick={() => handleDeleteSupplier(supplier.id)}
                                disabled={
                                  supplier.hasAssignedPOs ||
                                  supplier.hasAssignedInvoices
                                }
                                className="p-2 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title={
                                  supplier.hasAssignedPOs ||
                                  supplier.hasAssignedInvoices
                                    ? "No se puede eliminar con POs/Facturas asignadas"
                                    : "Eliminar"
                                }
                              >
                                <Trash2 size={18} />
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

      {/* Modal de crear/editar/ver proveedor */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-500 to-indigo-700 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">
                {modalMode === "create" && "Nuevo proveedor"}
                {modalMode === "edit" && "Editar proveedor"}
                {modalMode === "view" && "Detalles del proveedor"}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
              <div className="space-y-6">
                {/* Información básica */}
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                    <Building2 size={20} className="text-indigo-600" />
                    Información básica
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Nombre fiscal
                      </label>
                      <input
                        type="text"
                        value={formData.fiscalName}
                        onChange={(e) =>
                          setFormData({ ...formData, fiscalName: e.target.value })
                        }
                        disabled={modalMode === "view"}
                        className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50"
                        placeholder="Nombre Fiscal S.L."
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Nombre comercial
                      </label>
                      <input
                        type="text"
                        value={formData.commercialName}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            commercialName: e.target.value,
                          })
                        }
                        disabled={modalMode === "view"}
                        className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50"
                        placeholder="Nombre Comercial"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        País
                      </label>
                      <select
                        value={formData.country}
                        onChange={(e) =>
                          setFormData({ ...formData, country: e.target.value })
                        }
                        disabled={modalMode === "view"}
                        className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50"
                      >
                        {COUNTRIES.map((country) => (
                          <option key={country.code} value={country.code}>
                            {country.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        NIF/CIF
                      </label>
                      <input
                        type="text"
                        value={formData.taxId}
                        onChange={(e) =>
                          setFormData({ ...formData, taxId: e.target.value })
                        }
                        disabled={modalMode === "view"}
                        className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50"
                        placeholder="B12345678"
                      />
                    </div>
                  </div>
                </div>

                {/* Dirección */}
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                    <MapPin size={20} className="text-indigo-600" />
                    Dirección
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Calle
                      </label>
                      <input
                        type="text"
                        value={formData.address.street}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            address: { ...formData.address, street: e.target.value },
                          })
                        }
                        disabled={modalMode === "view"}
                        className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50"
                        placeholder="Calle Principal"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Número
                      </label>
                      <input
                        type="text"
                        value={formData.address.number}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            address: { ...formData.address, number: e.target.value },
                          })
                        }
                        disabled={modalMode === "view"}
                        className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50"
                        placeholder="123"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Población
                      </label>
                      <input
                        type="text"
                        value={formData.address.city}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            address: { ...formData.address, city: e.target.value },
                          })
                        }
                        disabled={modalMode === "view"}
                        className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50"
                        placeholder="Madrid"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Provincia
                      </label>
                      <input
                        type="text"
                        value={formData.address.province}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            address: { ...formData.address, province: e.target.value },
                          })
                        }
                        disabled={modalMode === "view"}
                        className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50"
                        placeholder="Madrid"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Código postal
                      </label>
                      <input
                        type="text"
                        value={formData.address.postalCode}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            address: {
                              ...formData.address,
                              postalCode: e.target.value,
                            },
                          })
                        }
                        disabled={modalMode === "view"}
                        className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50"
                        placeholder="28001"
                      />
                    </div>
                  </div>
                </div>

                {/* Información bancaria */}
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                    <CreditCard size={20} className="text-indigo-600" />
                    Información de pago
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Método de pago
                      </label>
                      <select
                        value={formData.paymentMethod}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            paymentMethod: e.target.value as PaymentMethod,
                          })
                        }
                        disabled={modalMode === "view"}
                        className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50"
                      >
                        {PAYMENT_METHODS.map((method) => (
                          <option key={method.value} value={method.value}>
                            {method.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Número de cuenta (IBAN/SWIFT)
                      </label>
                      <input
                        type="text"
                        value={formData.bankAccount}
                        onChange={(e) =>
                          setFormData({ ...formData, bankAccount: e.target.value })
                        }
                        disabled={modalMode === "view"}
                        className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50"
                        placeholder="ES91 2100 0418 4502 0005 1332"
                      />
                    </div>
                  </div>
                </div>

                {/* Certificados */}
                {modalMode !== "view" && (
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                      <FileText size={20} className="text-indigo-600" />
                      Certificados
                    </h3>
                    <div className="space-y-4">
                      {/* Certificado de titularidad bancaria */}
                      <div className="border-2 border-dashed border-slate-300 rounded-xl p-4 hover:border-indigo-400 transition-colors">
                        <div className="flex items-start gap-4">
                          <div className="bg-indigo-100 p-3 rounded-lg">
                            <FileCheck size={24} className="text-indigo-600" />
                          </div>
                          <div className="flex-1">
                            <h4 className="font-semibold text-slate-900 mb-1">
                              Certificado de titularidad bancaria
                            </h4>
                            <p className="text-sm text-slate-600 mb-3">
                              Documento que acredita la titularidad de la cuenta
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">
                                  Subir archivo
                                </label>
                                <input
                                  type="file"
                                  onChange={(e) =>
                                    setCertificates({
                                      ...certificates,
                                      bankOwnership: {
                                        ...certificates.bankOwnership,
                                        file: e.target.files?.[0] || null,
                                      },
                                    })
                                  }
                                  className="w-full text-sm"
                                  accept=".pdf,.jpg,.jpeg,.png"
                                />
                                {certificates.bankOwnership.file && (
                                  <p className="text-xs text-emerald-600 mt-1">
                                    Archivo seleccionado:{" "}
                                    {certificates.bankOwnership.file.name}
                                  </p>
                                )}
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">
                                  Fecha de caducidad
                                </label>
                                <input
                                  type="date"
                                  value={certificates.bankOwnership.expiryDate}
                                  onChange={(e) =>
                                    setCertificates({
                                      ...certificates,
                                      bankOwnership: {
                                        ...certificates.bankOwnership,
                                        expiryDate: e.target.value,
                                      },
                                    })
                                  }
                                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Certificado de contratistas */}
                      <div className="border-2 border-dashed border-slate-300 rounded-xl p-4 hover:border-indigo-400 transition-colors">
                        <div className="flex items-start gap-4">
                          <div className="bg-emerald-100 p-3 rounded-lg">
                            <FileCheck size={24} className="text-emerald-600" />
                          </div>
                          <div className="flex-1">
                            <h4 className="font-semibold text-slate-900 mb-1">
                              Certificado de contratistas y subcontratistas
                            </h4>
                            <p className="text-sm text-slate-600 mb-3">
                              Verificación AEAT de alta en actividad
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">
                                  Subir archivo
                                </label>
                                <input
                                  type="file"
                                  onChange={(e) =>
                                    setCertificates({
                                      ...certificates,
                                      contractorsCertificate: {
                                        ...certificates.contractorsCertificate,
                                        file: e.target.files?.[0] || null,
                                      },
                                    })
                                  }
                                  className="w-full text-sm"
                                  accept=".pdf,.jpg,.jpeg,.png"
                                />
                                {certificates.contractorsCertificate.file && (
                                  <p className="text-xs text-emerald-600 mt-1">
                                    Archivo seleccionado:{" "}
                                    {certificates.contractorsCertificate.file.name}
                                  </p>
                                )}
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">
                                  Fecha de caducidad
                                </label>
                                <input
                                  type="date"
                                  value={certificates.contractorsCertificate.expiryDate}
                                  onChange={(e) =>
                                    setCertificates({
                                      ...certificates,
                                      contractorsCertificate: {
                                        ...certificates.contractorsCertificate,
                                        expiryDate: e.target.value,
                                      },
                                    })
                                  }
                                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                    <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                      <FileText size={20} className="text-indigo-600" />
                      Estado de certificados
                    </h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200">
                        <div>
                          <p className="font-medium text-slate-900">
                            Certificado de titularidad bancaria
                          </p>
                          {selectedSupplier.certificates.bankOwnership.expiryDate && (
                            <p className="text-sm text-slate-600">
                              Caduca:{" "}
                              {new Intl.DateTimeFormat("es-ES").format(
                                selectedSupplier.certificates.bankOwnership.expiryDate
                              )}
                            </p>
                          )}
                        </div>
                        {getCertificateBadge(
                          selectedSupplier.certificates.bankOwnership
                        )}
                      </div>
                      <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200">
                        <div>
                          <p className="font-medium text-slate-900">
                            Certificado de contratistas
                          </p>
                          {selectedSupplier.certificates.contractorsCertificate
                            .expiryDate && (
                            <p className="text-sm text-slate-600">
                              Caduca:{" "}
                              {new Intl.DateTimeFormat("es-ES").format(
                                selectedSupplier.certificates.contractorsCertificate
                                  .expiryDate
                              )}
                            </p>
                          )}
                        </div>
                        {getCertificateBadge(
                          selectedSupplier.certificates.contractorsCertificate
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Botones de acción */}
              <div className="mt-6 flex justify-end gap-3 pt-6 border-t border-slate-200">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-6 py-2.5 border-2 border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium transition-colors"
                >
                  {modalMode === "view" ? "Cerrar" : "Cancelar"}
                </button>
                {modalMode !== "view" && (
                  <button
                    onClick={
                      modalMode === "create"
                        ? handleCreateSupplier
                        : handleUpdateSupplier
                    }
                    className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors shadow-lg"
                  >
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

