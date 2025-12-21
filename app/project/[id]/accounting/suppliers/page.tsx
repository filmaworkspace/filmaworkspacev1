"use client";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Inter } from "next/font/google";
import { useState, useEffect, useRef } from "react";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, collection, getDocs, addDoc, updateDoc, deleteDoc, query, Timestamp, orderBy } from "firebase/firestore";
import { Plus, Search, Download, Edit, Trash2, X, FileCheck, FileX, AlertCircle, CheckCircle, Building2, MapPin, CreditCard, Globe, FileText, Clock, Eye, ArrowLeft, MoreHorizontal, User, Mail, Phone, ShieldCheck, LayoutGrid, List, ExternalLink, Hash, Calendar, AlertTriangle, Lock } from "lucide-react";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

interface Address { street: string; number: string; city: string; province: string; postalCode: string; }
interface Contact { name: string; email: string; phone: string; }
interface Certificate { url?: string; expiryDate?: Date; uploaded: boolean; fileName?: string; verified?: boolean; verifiedBy?: string; verifiedByName?: string; verifiedAt?: Date; }
interface Supplier { id: string; fiscalName: string; commercialName: string; country: string; taxId: string; address: Address; contact: Contact; paymentMethod: string; bankAccount: string; certificates: { bankOwnership: Certificate; contractorsCertificate: Certificate & { aeatVerified?: boolean }; }; createdAt: Date; createdBy: string; hasAssignedPOs: boolean; hasAssignedInvoices: boolean; }

type PaymentMethod = "transferencia" | "tb30" | "tb60" | "tarjeta" | "efectivo";
type ViewMode = "table" | "cards";

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "transferencia", label: "Transferencia bancaria" },
  { value: "tb30", label: "Transferencia 30 días" },
  { value: "tb60", label: "Transferencia 60 días" },
  { value: "tarjeta", label: "Tarjeta" },
  { value: "efectivo", label: "Efectivo" },
];

const COUNTRIES = [
  { code: "ES", name: "España", flag: "🇪🇸", ibanLength: 24, ibanPrefix: "ES" },
  { code: "FR", name: "Francia", flag: "🇫🇷", ibanLength: 27, ibanPrefix: "FR" },
  { code: "DE", name: "Alemania", flag: "🇩🇪", ibanLength: 22, ibanPrefix: "DE" },
  { code: "IT", name: "Italia", flag: "🇮🇹", ibanLength: 27, ibanPrefix: "IT" },
  { code: "PT", name: "Portugal", flag: "🇵🇹", ibanLength: 25, ibanPrefix: "PT" },
  { code: "UK", name: "Reino Unido", flag: "🇬🇧", ibanLength: 22, ibanPrefix: "GB" },
  { code: "US", name: "Estados Unidos", flag: "🇺🇸", ibanLength: 0, ibanPrefix: "" },
];

// Capitalización inteligente
const capitalizeSupplierName = (name: string): string => {
  if (!name) return "";
  
  // Palabras que van en minúscula (artículos, preposiciones)
  const lowercaseWords = ["de", "del", "la", "las", "el", "los", "y", "e", "en", "a", "con", "por", "para"];
  
  // Formas societarias a normalizar
  const societyForms: Record<string, string> = {
    "s.l.": "SL", "s. l.": "SL", "sl": "SL", "s.l": "SL",
    "s.a.": "SA", "s. a.": "SA", "sa": "SA", "s.a": "SA",
    "s.c.": "SC", "s. c.": "SC", "sc": "SC", "s.c": "SC",
    "s.l.u.": "SLU", "s. l. u.": "SLU", "slu": "SLU", "s.l.u": "SLU",
    "s.c.p.": "SCP", "s. c. p.": "SCP", "scp": "SCP", "s.c.p": "SCP",
    "s.a.u.": "SAU", "s. a. u.": "SAU", "sau": "SAU", "s.a.u": "SAU",
    "s.l.l.": "SLL", "s. l. l.": "SLL", "sll": "SLL",
    "coop.": "COOP", "coop": "COOP",
  };

  // Primero normalizar formas societarias
  let normalized = name.toLowerCase();
  Object.entries(societyForms).forEach(([pattern, replacement]) => {
    const regex = new RegExp(`\\b${pattern.replace(/\./g, "\\.")}\\b`, "gi");
    normalized = normalized.replace(regex, replacement);
  });

  // Capitalizar cada palabra
  const words = normalized.split(/\s+/);
  const capitalized = words.map((word, index) => {
    // Si es forma societaria, mantener mayúsculas
    if (["SL", "SA", "SC", "SLU", "SCP", "SAU", "SLL", "COOP"].includes(word.toUpperCase())) {
      return word.toUpperCase();
    }
    // Si es artículo/preposición y no es la primera palabra
    if (index > 0 && lowercaseWords.includes(word.toLowerCase())) {
      return word.toLowerCase();
    }
    // Capitalizar primera letra
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });

  return capitalized.join(" ");
};

// Formatear IBAN con espacios
const formatIBAN = (iban: string): string => {
  const clean = iban.replace(/\s/g, "").toUpperCase();
  return clean.match(/.{1,4}/g)?.join(" ") || clean;
};

// Validar NIF/CIF español
const validateSpanishTaxId = (taxId: string): boolean => {
  const clean = taxId.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (clean.length !== 9) return false;
  
  const letters = "TRWAGMYFPDXBNJZSQVHLCKE";
  const firstChar = clean.charAt(0);
  
  // NIF (empieza por número o X, Y, Z)
  if (/^[0-9XYZ]/.test(firstChar)) {
    let num = clean.slice(0, 8);
    if (firstChar === "X") num = "0" + num.slice(1);
    else if (firstChar === "Y") num = "1" + num.slice(1);
    else if (firstChar === "Z") num = "2" + num.slice(1);
    const expectedLetter = letters[parseInt(num) % 23];
    return clean.charAt(8) === expectedLetter;
  }
  
  // CIF (empieza por letra)
  return /^[ABCDEFGHJKLMNPQRSUVW][0-9]{7}[0-9A-J]$/.test(clean);
};

export default function SuppliersPage() {
  const params = useParams();
  const router = useRouter();
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
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("");
  const [userAccountingLevel, setUserAccountingLevel] = useState<string>("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [previewSupplier, setPreviewSupplier] = useState<Supplier | null>(null);
  const [taxIdError, setTaxIdError] = useState("");
  const menuButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const [formData, setFormData] = useState({
    fiscalName: "",
    commercialName: "",
    country: "ES",
    taxId: "",
    address: { street: "", number: "", city: "", province: "", postalCode: "" },
    contact: { name: "", email: "", phone: "" },
    paymentMethod: "transferencia" as PaymentMethod,
    bankAccount: "",
  });

  const [certificates, setCertificates] = useState({
    bankOwnership: { file: null as File | null, expiryDate: "", verified: false },
    contractorsCertificate: { file: null as File | null, expiryDate: "", verified: false },
  });

  const canVerifyCertificates = userAccountingLevel === "accounting_extended";

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        setUserId(user.uid);
        setUserName(user.displayName || user.email || "Usuario");
        // Cargar nivel de acceso
        try {
          const memberDoc = await getDoc(doc(db, `projects/${id}/members`, user.uid));
          if (memberDoc.exists()) {
            setUserAccountingLevel(memberDoc.data().accountingAccessLevel || "user");
          }
        } catch (e) { console.error(e); }
      }
    });
    return () => unsubscribe();
  }, [id]);

  useEffect(() => { if (userId && id) loadData(); }, [userId, id]);
  useEffect(() => { filterSuppliers(); }, [searchTerm, filterStatus, suppliers]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.menu-container')) { setOpenMenuId(null); }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const projectDoc = await getDoc(doc(db, "projects", id));
      if (projectDoc.exists()) setProjectName(projectDoc.data().name || "Proyecto");

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
      filtered = filtered.filter((s) =>
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

  const getCountryInfo = (code: string) => COUNTRIES.find(c => c.code === code) || COUNTRIES[0];

  const handleCountryChange = (newCountry: string) => {
    const countryInfo = getCountryInfo(newCountry);
    let newBankAccount = formData.bankAccount;
    
    // Si el IBAN actual tiene un prefijo de otro país, cambiarlo
    const currentPrefix = formData.bankAccount.replace(/\s/g, "").slice(0, 2);
    const oldCountry = COUNTRIES.find(c => c.ibanPrefix === currentPrefix);
    
    if (oldCountry || !formData.bankAccount) {
      newBankAccount = countryInfo.ibanPrefix;
    }
    
    setFormData({ ...formData, country: newCountry, bankAccount: newBankAccount });
  };

  const handleBankAccountChange = (value: string) => {
    const countryInfo = getCountryInfo(formData.country);
    let clean = value.replace(/\s/g, "").toUpperCase();
    
    // Asegurar que empiece con el prefijo del país
    if (countryInfo.ibanPrefix && !clean.startsWith(countryInfo.ibanPrefix)) {
      clean = countryInfo.ibanPrefix + clean.replace(/^[A-Z]{0,2}/, "");
    }
    
    // Limitar longitud
    if (countryInfo.ibanLength > 0) {
      clean = clean.slice(0, countryInfo.ibanLength);
    }
    
    setFormData({ ...formData, bankAccount: formatIBAN(clean) });
  };

  const handleTaxIdChange = (value: string) => {
    const clean = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    setFormData({ ...formData, taxId: clean });
    
    if (formData.country === "ES" && clean.length === 9) {
      if (!validateSpanishTaxId(clean)) {
        setTaxIdError("NIF/CIF no válido");
      } else {
        setTaxIdError("");
      }
    } else {
      setTaxIdError("");
    }
  };

  const handleFiscalNameBlur = () => {
    setFormData({ ...formData, fiscalName: capitalizeSupplierName(formData.fiscalName) });
  };

  const handleCommercialNameBlur = () => {
    setFormData({ ...formData, commercialName: capitalizeSupplierName(formData.commercialName) });
  };

  const validateForm = () => {
    if (!formData.fiscalName.trim()) { setErrorMessage("El nombre fiscal es obligatorio"); return false; }
    if (!formData.taxId.trim()) { setErrorMessage("El NIF/CIF es obligatorio"); return false; }
    if (formData.country === "ES" && !validateSpanishTaxId(formData.taxId)) { setErrorMessage("El NIF/CIF no es válido"); return false; }
    return true;
  };

  const handleCreateSupplier = async () => {
    if (!validateForm()) return;
    setSaving(true);
    setErrorMessage("");

    try {
      const newSupplier = {
        fiscalName: capitalizeSupplierName(formData.fiscalName.trim()),
        commercialName: capitalizeSupplierName(formData.commercialName.trim()),
        country: formData.country,
        taxId: formData.taxId.trim().toUpperCase(),
        address: {
          street: formData.address.street.trim(),
          number: formData.address.number.trim(),
          city: formData.address.city.trim(),
          province: formData.address.province.trim(),
          postalCode: formData.address.postalCode.trim(),
        },
        contact: {
          name: formData.contact.name.trim(),
          email: formData.contact.email.trim(),
          phone: formData.contact.phone.trim(),
        },
        paymentMethod: formData.paymentMethod,
        bankAccount: formData.bankAccount.replace(/\s/g, ""),
        certificates: {
          bankOwnership: {
            uploaded: !!certificates.bankOwnership.file,
            expiryDate: certificates.bankOwnership.expiryDate ? Timestamp.fromDate(new Date(certificates.bankOwnership.expiryDate)) : null,
            fileName: certificates.bankOwnership.file?.name || "",
            verified: false,
          },
          contractorsCertificate: {
            uploaded: !!certificates.contractorsCertificate.file,
            expiryDate: certificates.contractorsCertificate.expiryDate ? Timestamp.fromDate(new Date(certificates.contractorsCertificate.expiryDate)) : null,
            fileName: certificates.contractorsCertificate.file?.name || "",
            verified: false,
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
      const updatedData: any = {
        fiscalName: capitalizeSupplierName(formData.fiscalName.trim()),
        commercialName: capitalizeSupplierName(formData.commercialName.trim()),
        country: formData.country,
        taxId: formData.taxId.trim().toUpperCase(),
        address: {
          street: formData.address.street.trim(),
          number: formData.address.number.trim(),
          city: formData.address.city.trim(),
          province: formData.address.province.trim(),
          postalCode: formData.address.postalCode.trim(),
        },
        contact: {
          name: formData.contact.name.trim(),
          email: formData.contact.email.trim(),
          phone: formData.contact.phone.trim(),
        },
        paymentMethod: formData.paymentMethod,
        bankAccount: formData.bankAccount.replace(/\s/g, ""),
      };

      // Certificados - solo actualizar si hay cambios
      const bankOwnershipUpdate: any = { ...selectedSupplier.certificates.bankOwnership };
      if (certificates.bankOwnership.file) {
        bankOwnershipUpdate.uploaded = true;
        bankOwnershipUpdate.fileName = certificates.bankOwnership.file.name;
      }
      if (certificates.bankOwnership.expiryDate) {
        bankOwnershipUpdate.expiryDate = Timestamp.fromDate(new Date(certificates.bankOwnership.expiryDate));
      }
      if (canVerifyCertificates && certificates.bankOwnership.verified !== selectedSupplier.certificates.bankOwnership.verified) {
        bankOwnershipUpdate.verified = certificates.bankOwnership.verified;
        if (certificates.bankOwnership.verified) {
          bankOwnershipUpdate.verifiedBy = userId;
          bankOwnershipUpdate.verifiedByName = userName;
          bankOwnershipUpdate.verifiedAt = Timestamp.now();
        } else {
          bankOwnershipUpdate.verifiedBy = null;
          bankOwnershipUpdate.verifiedByName = null;
          bankOwnershipUpdate.verifiedAt = null;
        }
      }

      const contractorsCertUpdate: any = { ...selectedSupplier.certificates.contractorsCertificate };
      if (certificates.contractorsCertificate.file) {
        contractorsCertUpdate.uploaded = true;
        contractorsCertUpdate.fileName = certificates.contractorsCertificate.file.name;
      }
      if (certificates.contractorsCertificate.expiryDate) {
        contractorsCertUpdate.expiryDate = Timestamp.fromDate(new Date(certificates.contractorsCertificate.expiryDate));
      }
      if (canVerifyCertificates && certificates.contractorsCertificate.verified !== selectedSupplier.certificates.contractorsCertificate.verified) {
        contractorsCertUpdate.verified = certificates.contractorsCertificate.verified;
        if (certificates.contractorsCertificate.verified) {
          contractorsCertUpdate.verifiedBy = userId;
          contractorsCertUpdate.verifiedByName = userName;
          contractorsCertUpdate.verifiedAt = Timestamp.now();
        } else {
          contractorsCertUpdate.verifiedBy = null;
          contractorsCertUpdate.verifiedByName = null;
          contractorsCertUpdate.verifiedAt = null;
        }
      }

      updatedData.certificates = {
        bankOwnership: bankOwnershipUpdate,
        contractorsCertificate: contractorsCertUpdate,
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

  const handleDeleteSupplier = async (supplier: Supplier) => {
    if (supplier.hasAssignedPOs || supplier.hasAssignedInvoices) {
      setErrorMessage("No se puede eliminar un proveedor con POs o facturas asignadas");
      setTimeout(() => setErrorMessage(""), 5000);
      setOpenMenuId(null);
      return;
    }
    if (!confirm(`¿Eliminar a ${supplier.fiscalName}?`)) { setOpenMenuId(null); return; }
    try {
      await deleteDoc(doc(db, `projects/${id}/suppliers`, supplier.id));
      setSuccessMessage("Proveedor eliminado");
      setTimeout(() => setSuccessMessage(""), 3000);
      setOpenMenuId(null);
      await loadData();
    } catch (error: any) {
      setErrorMessage(`Error eliminando proveedor: ${error.message}`);
      setOpenMenuId(null);
    }
  };

  const resetForm = () => {
    setFormData({
      fiscalName: "", commercialName: "", country: "ES", taxId: "",
      address: { street: "", number: "", city: "", province: "", postalCode: "" },
      contact: { name: "", email: "", phone: "" },
      paymentMethod: "transferencia", bankAccount: "ES",
    });
    setCertificates({
      bankOwnership: { file: null, expiryDate: "", verified: false },
      contractorsCertificate: { file: null, expiryDate: "", verified: false },
    });
    setSelectedSupplier(null);
    setErrorMessage("");
    setTaxIdError("");
  };

  const openCreateModal = () => { resetForm(); setModalMode("create"); setShowModal(true); };

  const openEditModal = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setFormData({
      fiscalName: supplier.fiscalName,
      commercialName: supplier.commercialName,
      country: supplier.country,
      taxId: supplier.taxId,
      address: supplier.address,
      contact: supplier.contact || { name: "", email: "", phone: "" },
      paymentMethod: supplier.paymentMethod as PaymentMethod,
      bankAccount: formatIBAN(supplier.bankAccount),
    });
    setCertificates({
      bankOwnership: {
        file: null,
        expiryDate: supplier.certificates.bankOwnership.expiryDate ? new Date(supplier.certificates.bankOwnership.expiryDate).toISOString().split('T')[0] : "",
        verified: supplier.certificates.bankOwnership.verified || false,
      },
      contractorsCertificate: {
        file: null,
        expiryDate: supplier.certificates.contractorsCertificate.expiryDate ? new Date(supplier.certificates.contractorsCertificate.expiryDate).toISOString().split('T')[0] : "",
        verified: supplier.certificates.contractorsCertificate.verified || false,
      },
    });
    setModalMode("edit");
    setShowModal(true);
    setOpenMenuId(null);
  };

  const getCertificateBadge = (cert: Certificate) => {
    if (!cert.uploaded) {
      return (<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-red-50 text-red-700"><FileX size={12} />No subido</span>);
    }
    if (cert.verified) {
      return (<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-emerald-50 text-emerald-700"><ShieldCheck size={12} />Verificado</span>);
    }
    if (!cert.expiryDate) {
      return (<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-blue-50 text-blue-700"><FileCheck size={12} />Subido</span>);
    }
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    if (cert.expiryDate < now) {
      return (<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-red-50 text-red-700"><AlertCircle size={12} />Caducado</span>);
    }
    if (cert.expiryDate < thirtyDaysFromNow) {
      return (<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-amber-50 text-amber-700"><Clock size={12} />Por caducar</span>);
    }
    return (<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-emerald-50 text-emerald-700"><CheckCircle size={12} />Válido</span>);
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { bg: string; text: string; label: string }> = {
      valid: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Válido" },
      expiring: { bg: "bg-amber-50", text: "text-amber-700", label: "Por caducar" },
      expired: { bg: "bg-red-50", text: "text-red-700", label: "Acción requerida" },
    };
    const c = config[status] || config.valid;
    return <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${c.bg} ${c.text}`}>{c.label}</span>;
  };

  const getMenuPosition = (supplierId: string) => {
    const button = menuButtonRefs.current.get(supplierId);
    if (!button) return { top: 0, left: 0 };
    const rect = button.getBoundingClientRect();
    return { top: rect.bottom + 4, left: rect.right - 192 };
  };

  const exportSuppliers = () => {
    const rows = [["NOMBRE FISCAL", "NOMBRE COMERCIAL", "PAÍS", "NIF/CIF", "CONTACTO", "EMAIL", "TELÉFONO", "MÉTODO PAGO", "CUENTA BANCARIA"]];
    suppliers.forEach((supplier) => {
      rows.push([supplier.fiscalName, supplier.commercialName, supplier.country, supplier.taxId, supplier.contact?.name || "", supplier.contact?.email || "", supplier.contact?.phone || "", supplier.paymentMethod, supplier.bankAccount]);
    });
    const csvContent = rows.map((row) => row.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.setAttribute("href", URL.createObjectURL(blob));
    link.setAttribute("download", `proveedores_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatDate = (date: Date) => date ? new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", year: "numeric" }).format(date) : "-";

  if (loading) {
    return (<div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}><div className="w-12 h-12 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" /></div>);
  }

  return (
    <div className={`min-h-screen bg-white ${inter.className}`}>
      {/* Header */}
      <div className="mt-[4.5rem]">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-6">
          <div className="mb-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">
              <Link href="/dashboard" className="inline-flex items-center gap-1 hover:text-slate-900 transition-colors"><ArrowLeft size={12} />Proyectos</Link>
              <span className="text-slate-300">·</span>
              <Link href={`/project/${id}/accounting`} className="hover:text-slate-900 transition-colors">Panel</Link>
              <span className="text-slate-300">·</span>
              <span className="uppercase text-slate-500">{projectName}</span>
            </div>
          </div>

          <div className="flex items-start justify-between border-b border-slate-200 pb-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center">
                <Building2 size={24} className="text-indigo-600" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">Proveedores</h1>
                <p className="text-slate-500 text-sm mt-0.5">{suppliers.length} proveedores registrados</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button onClick={exportSuppliers} className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors">
                <Download size={16} />
                Exportar
              </button>
              <button onClick={openCreateModal} className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors">
                <Plus size={18} />
                Añadir proveedor
              </button>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 md:px-12 py-8">
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
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="flex-1 relative">
            <Search size={18} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="Buscar por nombre o NIF..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white text-sm" />
          </div>
          <div className="flex gap-2">
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as any)} className="px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white text-sm">
              <option value="all">Todos los estados</option>
              <option value="valid">Certificados válidos</option>
              <option value="expiring">Próximos a caducar</option>
              <option value="expired">Acción requerida</option>
            </select>
            <div className="flex border border-slate-200 rounded-xl overflow-hidden bg-white">
              <button onClick={() => setViewMode("table")} className={`px-4 py-3 text-sm transition-colors ${viewMode === "table" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}><List size={18} /></button>
              <button onClick={() => setViewMode("cards")} className={`px-4 py-3 text-sm transition-colors border-l border-slate-200 ${viewMode === "cards" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}><LayoutGrid size={18} /></button>
            </div>
          </div>
        </div>

        {/* Content */}
        {filteredSuppliers.length === 0 ? (
          <div className="border-2 border-dashed border-slate-200 rounded-2xl p-16 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4"><Building2 size={28} className="text-slate-400" /></div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">{searchTerm || filterStatus !== "all" ? "No se encontraron proveedores" : "No hay proveedores registrados"}</h3>
            <p className="text-slate-500 text-sm mb-6">{searchTerm || filterStatus !== "all" ? "Intenta ajustar los filtros" : "Añade tu primer proveedor al proyecto"}</p>
            {!searchTerm && filterStatus === "all" && (
              <button onClick={openCreateModal} className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800"><Plus size={18} />Añadir proveedor</button>
            )}
          </div>
        ) : viewMode === "table" ? (
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Proveedor</th>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">NIF</th>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Contacto</th>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Certificados</th>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Estado</th>
                  <th className="w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSuppliers.map((supplier) => {
                  const status = getCertificateStatus(supplier);
                  const countryInfo = getCountryInfo(supplier.country);
                  return (
                    <tr key={supplier.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-6 py-4">
                        <button onClick={() => setPreviewSupplier(supplier)} className="text-left hover:text-indigo-600 transition-colors">
                          <div className="flex items-center gap-2">
                            <div>
                              <p className="font-semibold text-slate-900 group-hover:text-indigo-600">{supplier.fiscalName}</p>
                              {supplier.commercialName && <p className="text-xs text-slate-500">{supplier.commercialName}</p>}
                            </div>
                          </div>
                        </button>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-mono text-slate-900">{supplier.taxId}</span>
                      </td>
                      <td className="px-6 py-4">
                        {supplier.contact?.name ? (
                          <div>
                            <p className="text-sm text-slate-900">{supplier.contact.name}</p>
                            {supplier.contact.email && <p className="text-xs text-slate-500">{supplier.contact.email}</p>}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">Sin contacto</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {getCertificateBadge(supplier.certificates.bankOwnership)}
                          {getCertificateBadge(supplier.certificates.contractorsCertificate)}
                        </div>
                      </td>
                      <td className="px-6 py-4">{getStatusBadge(status)}</td>
                      <td className="px-6 py-4">
                        <div className="relative menu-container">
                          <button ref={(el) => { if (el) menuButtonRefs.current.set(supplier.id, el); }} onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === supplier.id ? null : supplier.id); }} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
                            <MoreHorizontal size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* Cards View */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSuppliers.map((supplier) => {
              const status = getCertificateStatus(supplier);
              const countryInfo = getCountryInfo(supplier.country);
              return (
                <div key={supplier.id} className="bg-white border border-slate-200 rounded-2xl p-5 hover:shadow-lg hover:border-slate-300 transition-all group relative">
                  <div className="flex items-start justify-between mb-4">
                    <button onClick={() => setPreviewSupplier(supplier)} className="text-left flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">{supplier.fiscalName}</p>
                      </div>
                      {supplier.commercialName && <p className="text-sm text-slate-500">{supplier.commercialName}</p>}
                    </button>
                    <div className="relative menu-container">
                      <button ref={(el) => { if (el) menuButtonRefs.current.set(supplier.id, el); }} onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === supplier.id ? null : supplier.id); }} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
                        <MoreHorizontal size={16} />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3 mb-4">
                    <div className="flex items-center gap-2 text-sm">
                      <Hash size={14} className="text-slate-400" />
                      <span className="font-mono text-slate-700">{supplier.taxId}</span>
                    </div>
                    {supplier.contact?.name && (
                      <div className="flex items-center gap-2 text-sm">
                        <User size={14} className="text-slate-400" />
                        <span className="text-slate-700">{supplier.contact.name}</span>
                      </div>
                    )}
                    {supplier.bankAccount && (
                      <div className="flex items-center gap-2 text-sm">
                        <CreditCard size={14} className="text-slate-400" />
                        <span className="font-mono text-slate-700 text-xs">{formatIBAN(supplier.bankAccount)}</span>
                      </div>
                    )}
                  </div>

                  <div className="pt-4 border-t border-slate-100">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {getCertificateBadge(supplier.certificates.bankOwnership)}
                        {getCertificateBadge(supplier.certificates.contractorsCertificate)}
                      </div>
                      {getStatusBadge(status)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Floating Menu */}
        {openMenuId && (
          <div className="fixed w-48 bg-white border border-slate-200 rounded-xl shadow-xl z-[9999] py-1" style={getMenuPosition(openMenuId)}>
            {(() => {
              const supplier = filteredSuppliers.find((s) => s.id === openMenuId);
              if (!supplier) return null;
              return (
                <>
                  <button onClick={() => { setPreviewSupplier(supplier); setOpenMenuId(null); }} className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3"><Eye size={15} className="text-slate-400" />Ver detalles</button>
                  <button onClick={() => openEditModal(supplier)} className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3"><Edit size={15} className="text-slate-400" />Editar</button>
                  <div className="border-t border-slate-100 my-1" />
                  <button onClick={() => handleDeleteSupplier(supplier)} disabled={supplier.hasAssignedPOs || supplier.hasAssignedInvoices} className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed">
                    <Trash2 size={15} />
                    Eliminar
                    {(supplier.hasAssignedPOs || supplier.hasAssignedInvoices) && <Lock size={12} className="ml-auto text-slate-400" />}
                  </button>
                </>
              );
            })()}
          </div>
        )}
      </main>

      {/* Preview Modal */}
      {previewSupplier && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setPreviewSupplier(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Header with gradient */}
            <div className="bg-gradient-to-r from-indigo-500 to-purple-500 px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                    <Building2 size={24} className="text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-lg">{previewSupplier.fiscalName}</h3>
                    {previewSupplier.commercialName && <p className="text-white/80 text-sm">{previewSupplier.commercialName}</p>}
                  </div>
                </div>
                <button onClick={() => setPreviewSupplier(null)} className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-xl transition-colors"><X size={18} /></button>
              </div>
            </div>

            <div className="p-6">
              {/* Info Grid */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs text-slate-500 mb-1 flex items-center gap-1"><Hash size={12} />NIF/CIF</p>
                  <p className="text-sm font-mono font-bold text-slate-900">{previewSupplier.taxId}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs text-slate-500 mb-1 flex items-center gap-1"><Globe size={12} />País</p>
                  <p className="text-sm font-bold text-slate-900">{getCountryInfo(previewSupplier.country).name}</p>
                </div>
              </div>

              {/* Bank Account */}
              {previewSupplier.bankAccount && (
                <div className="mb-6 p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                  <p className="text-xs text-indigo-600 mb-1 flex items-center gap-1"><CreditCard size={12} />Cuenta bancaria</p>
                  <p className="text-sm font-mono font-bold text-indigo-900">{formatIBAN(previewSupplier.bankAccount)}</p>
                </div>
              )}

              {/* Contact */}
              {previewSupplier.contact?.name && (
                <div className="mb-6">
                  <p className="text-xs text-slate-500 uppercase mb-3 font-medium">Contacto</p>
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                      <User size={16} className="text-slate-400" />
                      <span className="text-sm text-slate-900">{previewSupplier.contact.name}</span>
                    </div>
                    {previewSupplier.contact.email && (
                      <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                        <Mail size={16} className="text-slate-400" />
                        <a href={`mailto:${previewSupplier.contact.email}`} className="text-sm text-indigo-600 hover:underline">{previewSupplier.contact.email}</a>
                      </div>
                    )}
                    {previewSupplier.contact.phone && (
                      <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                        <Phone size={16} className="text-slate-400" />
                        <a href={`tel:${previewSupplier.contact.phone}`} className="text-sm text-slate-900">{previewSupplier.contact.phone}</a>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Certificates */}
              <div className="mb-6">
                <p className="text-xs text-slate-500 uppercase mb-3 font-medium">Certificados</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                    <div>
                      <p className="text-sm font-medium text-slate-900">Titularidad bancaria</p>
                      {previewSupplier.certificates.bankOwnership.expiryDate && (
                        <p className="text-xs text-slate-500">Caduca: {formatDate(previewSupplier.certificates.bankOwnership.expiryDate)}</p>
                      )}
                      {previewSupplier.certificates.bankOwnership.verified && previewSupplier.certificates.bankOwnership.verifiedByName && (
                        <p className="text-xs text-emerald-600 mt-1">Verificado por {previewSupplier.certificates.bankOwnership.verifiedByName}</p>
                      )}
                    </div>
                    {getCertificateBadge(previewSupplier.certificates.bankOwnership)}
                  </div>
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                    <div>
                      <p className="text-sm font-medium text-slate-900">Certificado contratistas</p>
                      {previewSupplier.certificates.contractorsCertificate.expiryDate && (
                        <p className="text-xs text-slate-500">Caduca: {formatDate(previewSupplier.certificates.contractorsCertificate.expiryDate)}</p>
                      )}
                      {previewSupplier.certificates.contractorsCertificate.verified && previewSupplier.certificates.contractorsCertificate.verifiedByName && (
                        <p className="text-xs text-emerald-600 mt-1">Verificado por {previewSupplier.certificates.contractorsCertificate.verifiedByName}</p>
                      )}
                    </div>
                    {getCertificateBadge(previewSupplier.certificates.contractorsCertificate)}
                  </div>
                </div>
              </div>

              {/* Quick info */}
              <div className="text-xs text-slate-500 space-y-2 pt-4 border-t border-slate-100">
                <div className="flex justify-between items-center py-2">
                  <span>Creado</span>
                  <span className="text-slate-700 font-medium">{formatDate(previewSupplier.createdAt)}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span>Método de pago</span>
                  <span className="text-slate-700 font-medium">{PAYMENT_METHODS.find(m => m.value === previewSupplier.paymentMethod)?.label || previewSupplier.paymentMethod}</span>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex gap-3">
              <button onClick={() => { openEditModal(previewSupplier); setPreviewSupplier(null); }} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl text-sm font-medium hover:bg-white transition-colors">
                <Edit size={16} />
                Editar
              </button>
              <button onClick={() => setPreviewSupplier(null)} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => { setShowModal(false); resetForm(); }}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                {modalMode === "create" ? "Nuevo proveedor" : "Editar proveedor"}
              </h2>
              <button onClick={() => { setShowModal(false); resetForm(); }} className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
              {errorMessage && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-2">
                  <AlertCircle size={16} />
                  {errorMessage}
                </div>
              )}

              <div className="space-y-6">
                {/* Información básica */}
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 mb-4 uppercase tracking-wider flex items-center gap-2">
                    <Building2 size={14} />
                    Información básica
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Nombre fiscal *</label>
                      <input
                        type="text"
                        value={formData.fiscalName}
                        onChange={(e) => setFormData({ ...formData, fiscalName: e.target.value })}
                        onBlur={handleFiscalNameBlur}
                        placeholder="Ej: Neumáticos García SL"
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900"
                      />
                      <p className="text-xs text-slate-500 mt-1">Se formateará automáticamente</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Nombre comercial</label>
                      <input
                        type="text"
                        value={formData.commercialName}
                        onChange={(e) => setFormData({ ...formData, commercialName: e.target.value })}
                        onBlur={handleCommercialNameBlur}
                        placeholder="Ej: Neumáticos García"
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">País</label>
                      <select
                        value={formData.country}
                        onChange={(e) => handleCountryChange(e.target.value)}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900"
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
                        value={formData.taxId}
                        onChange={(e) => handleTaxIdChange(e.target.value)}
                        placeholder={formData.country === "ES" ? "B12345678" : "ID fiscal"}
                        className={`w-full px-4 py-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 font-mono uppercase ${taxIdError ? "border-red-300 bg-red-50" : "border-slate-200"}`}
                      />
                      {taxIdError && <p className="text-xs text-red-600 mt-1 flex items-center gap-1"><AlertCircle size={12} />{taxIdError}</p>}
                    </div>
                  </div>
                </div>

                {/* Persona de contacto */}
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 mb-4 uppercase tracking-wider flex items-center gap-2">
                    <User size={14} />
                    Persona de contacto
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Nombre</label>
                      <div className="relative">
                        <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input type="text" value={formData.contact.name} onChange={(e) => setFormData({ ...formData, contact: { ...formData.contact, name: e.target.value } })} placeholder="Nombre del contacto" className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Email</label>
                      <div className="relative">
                        <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input type="email" value={formData.contact.email} onChange={(e) => setFormData({ ...formData, contact: { ...formData.contact, email: e.target.value } })} placeholder="email@ejemplo.com" className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Teléfono</label>
                      <div className="relative">
                        <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input type="tel" value={formData.contact.phone} onChange={(e) => setFormData({ ...formData, contact: { ...formData.contact, phone: e.target.value } })} placeholder="+34 600 000 000" className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Dirección */}
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 mb-4 uppercase tracking-wider flex items-center gap-2">
                    <MapPin size={14} />
                    Dirección
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-2">Calle</label>
                      <input type="text" value={formData.address.street} onChange={(e) => setFormData({ ...formData, address: { ...formData.address, street: e.target.value } })} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Número</label>
                      <input type="text" value={formData.address.number} onChange={(e) => setFormData({ ...formData, address: { ...formData.address, number: e.target.value } })} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Población</label>
                      <input type="text" value={formData.address.city} onChange={(e) => setFormData({ ...formData, address: { ...formData.address, city: e.target.value } })} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Provincia</label>
                      <input type="text" value={formData.address.province} onChange={(e) => setFormData({ ...formData, address: { ...formData.address, province: e.target.value } })} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Código postal</label>
                      <input type="text" value={formData.address.postalCode} onChange={(e) => setFormData({ ...formData, address: { ...formData.address, postalCode: e.target.value } })} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900" />
                    </div>
                  </div>
                </div>

                {/* Información de pago */}
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 mb-4 uppercase tracking-wider flex items-center gap-2">
                    <CreditCard size={14} />
                    Información de pago
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Método de pago</label>
                      <select value={formData.paymentMethod} onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value as PaymentMethod })} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900">
                        {PAYMENT_METHODS.map((method) => (<option key={method.value} value={method.value}>{method.label}</option>))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Cuenta bancaria (IBAN)</label>
                      <input
                        type="text"
                        value={formData.bankAccount}
                        onChange={(e) => handleBankAccountChange(e.target.value)}
                        placeholder={`${getCountryInfo(formData.country).ibanPrefix}XX XXXX XXXX XXXX XXXX XXXX`}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 font-mono"
                      />
                      <p className="text-xs text-slate-500 mt-1">Prefijo {getCountryInfo(formData.country).ibanPrefix} automático</p>
                    </div>
                  </div>
                </div>

                {/* Certificados */}
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 mb-4 uppercase tracking-wider flex items-center gap-2">
                    <FileText size={14} />
                    Certificados
                  </h3>
                  <div className="space-y-4">
                    {/* Bank Ownership Certificate */}
                    <div className="border border-slate-200 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-medium text-slate-900">Certificado de titularidad bancaria</h4>
                        {canVerifyCertificates ? (
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={certificates.bankOwnership.verified} onChange={(e) => setCertificates({ ...certificates, bankOwnership: { ...certificates.bankOwnership, verified: e.target.checked } })} className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                            <span className="text-sm text-slate-600 flex items-center gap-1"><ShieldCheck size={14} className="text-emerald-600" />Verificado</span>
                          </label>
                        ) : (
                          <span className="text-xs text-slate-400 flex items-center gap-1"><Lock size={12} />Solo contabilidad ampliada</span>
                        )}
                      </div>
                      
                      {/* Mostrar IBAN para verificación */}
                      {certificates.bankOwnership.verified && formData.bankAccount && (
                        <div className="mb-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                          <p className="text-xs text-emerald-700 mb-1">IBAN verificado:</p>
                          <p className="font-mono text-sm font-bold text-emerald-900">{formatIBAN(formData.bankAccount)}</p>
                        </div>
                      )}
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs text-slate-600 mb-1">Archivo</label>
                          <input type="file" onChange={(e) => setCertificates({ ...certificates, bankOwnership: { ...certificates.bankOwnership, file: e.target.files?.[0] || null } })} className="w-full text-sm" accept=".pdf,.jpg,.jpeg,.png" />
                          {modalMode === "edit" && selectedSupplier?.certificates.bankOwnership.fileName && (
                            <p className="text-xs text-slate-500 mt-1">Actual: {selectedSupplier.certificates.bankOwnership.fileName}</p>
                          )}
                        </div>
                        <div>
                          <label className="block text-xs text-slate-600 mb-1">Fecha caducidad</label>
                          <input type="date" value={certificates.bankOwnership.expiryDate} onChange={(e) => setCertificates({ ...certificates, bankOwnership: { ...certificates.bankOwnership, expiryDate: e.target.value } })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                        </div>
                      </div>
                    </div>

                    {/* Contractors Certificate */}
                    <div className="border border-slate-200 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-medium text-slate-900">Certificado de contratistas</h4>
                        {canVerifyCertificates ? (
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={certificates.contractorsCertificate.verified} onChange={(e) => setCertificates({ ...certificates, contractorsCertificate: { ...certificates.contractorsCertificate, verified: e.target.checked } })} className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                            <span className="text-sm text-slate-600 flex items-center gap-1"><ShieldCheck size={14} className="text-emerald-600" />Verificado</span>
                          </label>
                        ) : (
                          <span className="text-xs text-slate-400 flex items-center gap-1"><Lock size={12} />Solo contabilidad ampliada</span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs text-slate-600 mb-1">Archivo</label>
                          <input type="file" onChange={(e) => setCertificates({ ...certificates, contractorsCertificate: { ...certificates.contractorsCertificate, file: e.target.files?.[0] || null } })} className="w-full text-sm" accept=".pdf,.jpg,.jpeg,.png" />
                          {modalMode === "edit" && selectedSupplier?.certificates.contractorsCertificate.fileName && (
                            <p className="text-xs text-slate-500 mt-1">Actual: {selectedSupplier.certificates.contractorsCertificate.fileName}</p>
                          )}
                        </div>
                        <div>
                          <label className="block text-xs text-slate-600 mb-1">Fecha caducidad</label>
                          <input type="date" value={certificates.contractorsCertificate.expiryDate} onChange={(e) => setCertificates({ ...certificates, contractorsCertificate: { ...certificates.contractorsCertificate, expiryDate: e.target.value } })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3 bg-slate-50">
              <button onClick={() => { setShowModal(false); resetForm(); }} className="px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl hover:bg-white font-medium transition-colors">
                Cancelar
              </button>
              <button onClick={modalMode === "create" ? handleCreateSupplier : handleUpdateSupplier} disabled={saving} className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-medium transition-colors disabled:opacity-50 flex items-center gap-2">
                {saving && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {modalMode === "create" ? "Crear proveedor" : "Guardar cambios"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
