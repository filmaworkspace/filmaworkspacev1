"use client";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Inter } from "next/font/google";
import { useState, useEffect, useCallback } from "react";
import { auth, db, storage } from "@/lib/firebase";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  addDoc,
  query,
  orderBy,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import {
  Folder,
  Receipt,
  ArrowLeft,
  Save,
  Building2,
  DollarSign,
  AlertCircle,
  Info,
  Upload,
  X,
  Check,
  Plus,
  Trash2,
  Search,
  Calendar,
  Hash,
  Percent,
  FileText,
  ShoppingCart,
  CheckCircle,
  AlertTriangle,
  TrendingDown,
} from "lucide-react";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });

interface PO {
  id: string;
  number: string;
  supplier: string;
  supplierId: string;
  amount: number;
  status: string;
  items: POItem[];
}

interface POItem {
  id: string;
  description: string;
  subAccountId: string;
  subAccountCode: string;
  subAccountDescription: string;
  quantity: number;
  unitPrice: number;
  baseAmount: number;
  vatRate: number;
  vatAmount: number;
  irpfRate: number;
  irpfAmount: number;
  totalAmount: number;
}

interface InvoiceItem {
  id: string;
  description: string;
  poItemId?: string;
  isNewItem: boolean;
  subAccountId: string;
  subAccountCode: string;
  subAccountDescription: string;
  quantity: number;
  unitPrice: number;
  baseAmount: number;
  vatRate: number;
  vatAmount: number;
  irpfRate: number;
  irpfAmount: number;
  totalAmount: number;
}

interface SubAccount {
  id: string;
  code: string;
  description: string;
  budgeted: number;
  committed: number;
  actual: number;
  available: number;
  accountId: string;
  accountCode: string;
  accountDescription: string;
}

const VAT_RATES = [
  { value: 0, label: "0% (Exento)" },
  { value: 4, label: "4% (Superreducido)" },
  { value: 10, label: "10% (Reducido)" },
  { value: 21, label: "21% (General)" },
];

const IRPF_RATES = [
  { value: 0, label: "0% (Sin retención)" },
  { value: 7, label: "7%" },
  { value: 15, label: "15%" },
  { value: 19, label: "19%" },
  { value: 21, label: "21%" },
];

export default function NewInvoicePage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const [projectName, setProjectName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState("");
  const [nextInvoiceNumber, setNextInvoiceNumber] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [successMessage, setSuccessMessage] = useState("");

  // Modals
  const [showPOModal, setShowPOModal] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [poSearch, setPOSearch] = useState("");
  const [accountSearch, setAccountSearch] = useState("");
  const [currentItemIndex, setCurrentItemIndex] = useState<number | null>(null);

  // File upload
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Data
  const [pos, setPOs] = useState<PO[]>([]);
  const [subAccounts, setSubAccounts] = useState<SubAccount[]>([]);
  const [selectedPO, setSelectedPO] = useState<PO | null>(null);

  const [formData, setFormData] = useState({
    invoiceType: "with-po" as "with-po" | "without-po",
    supplier: "",
    supplierName: "",
    description: "",
    dueDate: "",
    notes: "",
  });

  const [items, setItems] = useState<InvoiceItem[]>([]);

  const [totals, setTotals] = useState({
    baseAmount: 0,
    vatAmount: 0,
    irpfAmount: 0,
    totalAmount: 0,
  });

  // PO stats
  const [poStats, setPOStats] = useState({
    totalAmount: 0,
    invoicedAmount: 0,
    remainingAmount: 0,
    percentageInvoiced: 0,
    isOverInvoiced: false,
  });

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        setUserId(user.uid);
        setUserName(user.displayName || user.email || "Usuario");
      } else {
        router.push("/");
      }
    });
    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    if (userId && id) {
      loadData();
    }
  }, [userId, id]);

  useEffect(() => {
    calculateTotals();
  }, [items]);

  useEffect(() => {
    if (selectedPO) {
      calculatePOStats();
    }
  }, [selectedPO, totals]);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load project
      const projectDoc = await getDoc(doc(db, "projects", id));
      if (projectDoc.exists()) {
        setProjectName(projectDoc.data().name || "Proyecto");
      }

      // Load approved POs
      const posQuery = query(
        collection(db, `projects/${id}/pos`),
        where("status", "==", "approved"),
        orderBy("createdAt", "desc")
      );
      const posSnapshot = await getDocs(posQuery);
      const posData = posSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        items: doc.data().items || [],
      })) as PO[];

      setPOs(posData);

      // Load accounts and subaccounts
      const accountsSnapshot = await getDocs(
        query(collection(db, `projects/${id}/accounts`), orderBy("code", "asc"))
      );

      const allSubAccounts: SubAccount[] = [];
      for (const accountDoc of accountsSnapshot.docs) {
        const accountData = accountDoc.data();
        const subAccountsSnapshot = await getDocs(
          query(
            collection(db, `projects/${id}/accounts/${accountDoc.id}/subaccounts`),
            orderBy("code", "asc")
          )
        );

        subAccountsSnapshot.docs.forEach((subDoc) => {
          const data = subDoc.data();
          const available = data.budgeted - data.committed - data.actual;
          allSubAccounts.push({
            id: subDoc.id,
            code: data.code,
            description: data.description,
            budgeted: data.budgeted,
            committed: data.committed,
            actual: data.actual,
            available,
            accountId: accountDoc.id,
            accountCode: accountData.code,
            accountDescription: accountData.description,
          });
        });
      }
      setSubAccounts(allSubAccounts);

      // Generate next invoice number
      const invoicesSnapshot = await getDocs(collection(db, `projects/${id}/invoices`));
      const nextNumber = String(invoicesSnapshot.size + 1).padStart(4, "0");
      setNextInvoiceNumber(nextNumber);

      // Set default due date (30 days from now)
      const defaultDueDate = new Date();
      defaultDueDate.setDate(defaultDueDate.getDate() + 30);
      setFormData((prev) => ({
        ...prev,
        dueDate: defaultDueDate.toISOString().split("T")[0],
      }));
    } catch (error) {
      console.error("Error cargando datos:", error);
    } finally {
      setLoading(false);
    }
  };

  const calculateItemTotal = (item: InvoiceItem) => {
    const baseAmount = item.quantity * item.unitPrice;
    const vatAmount = baseAmount * (item.vatRate / 100);
    const irpfAmount = baseAmount * (item.irpfRate / 100);
    const totalAmount = baseAmount + vatAmount - irpfAmount;

    return {
      baseAmount,
      vatAmount,
      irpfAmount,
      totalAmount,
    };
  };

  const updateItem = (index: number, field: keyof InvoiceItem, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };

    // Recalculate amounts
    const calculated = calculateItemTotal(newItems[index]);
    newItems[index] = {
      ...newItems[index],
      baseAmount: calculated.baseAmount,
      vatAmount: calculated.vatAmount,
      irpfAmount: calculated.irpfAmount,
      totalAmount: calculated.totalAmount,
    };

    setItems(newItems);
  };

  const addNewItem = () => {
    const newItem: InvoiceItem = {
      id: String(items.length + 1),
      description: "",
      isNewItem: true,
      subAccountId: "",
      subAccountCode: "",
      subAccountDescription: "",
      quantity: 1,
      unitPrice: 0,
      baseAmount: 0,
      vatRate: 21,
      vatAmount: 0,
      irpfRate: 0,
      irpfAmount: 0,
      totalAmount: 0,
    };
    setItems([...items, newItem]);
  };

  const removeItem = (index: number) => {
    if (items.length === 1) {
      alert("Debe haber al menos un ítem en la factura");
      return;
    }
    const newItems = items.filter((_, i) => i !== index);
    setItems(newItems);
  };

  const calculateTotals = () => {
    const baseAmount = items.reduce((sum, item) => sum + item.baseAmount, 0);
    const vatAmount = items.reduce((sum, item) => sum + item.vatAmount, 0);
    const irpfAmount = items.reduce((sum, item) => sum + item.irpfAmount, 0);
    const totalAmount = items.reduce((sum, item) => sum + item.totalAmount, 0);

    setTotals({ baseAmount, vatAmount, irpfAmount, totalAmount });
  };

  const calculatePOStats = async () => {
    if (!selectedPO) return;

    try {
      // Get all invoices for this PO
      const invoicesQuery = query(
        collection(db, `projects/${id}/invoices`),
        where("poId", "==", selectedPO.id),
        where("status", "in", ["pending", "paid", "overdue"])
      );
      const invoicesSnapshot = await getDocs(invoicesQuery);
      
      const invoicedAmount = invoicesSnapshot.docs.reduce(
        (sum, doc) => sum + (doc.data().totalAmount || 0),
        0
      );

      const currentInvoiceAmount = totals.totalAmount;
      const totalInvoiced = invoicedAmount + currentInvoiceAmount;
      const remainingAmount = selectedPO.amount - totalInvoiced;
      const percentageInvoiced = (totalInvoiced / selectedPO.amount) * 100;
      const isOverInvoiced = totalInvoiced > selectedPO.amount;

      setPOStats({
        totalAmount: selectedPO.amount,
        invoicedAmount: totalInvoiced,
        remainingAmount,
        percentageInvoiced,
        isOverInvoiced,
      });
    } catch (error) {
      console.error("Error calculando estadísticas de PO:", error);
    }
  };

  const selectPO = (po: PO) => {
    setSelectedPO(po);
    setFormData({
      ...formData,
      supplier: po.supplierId,
      supplierName: po.supplier,
      description: `Factura para PO-${po.number}`,
    });
    setShowPOModal(false);
    setPOSearch("");
  };

  const addPOItem = (poItem: POItem) => {
    // Check if item already added
    const alreadyAdded = items.find((item) => item.poItemId === poItem.id);
    if (alreadyAdded) {
      alert("Este ítem ya ha sido agregado a la factura");
      return;
    }

    const invoiceItem: InvoiceItem = {
      id: String(items.length + 1),
      description: poItem.description,
      poItemId: poItem.id,
      isNewItem: false,
      subAccountId: poItem.subAccountId,
      subAccountCode: poItem.subAccountCode,
      subAccountDescription: poItem.subAccountDescription,
      quantity: poItem.quantity,
      unitPrice: poItem.unitPrice,
      baseAmount: poItem.baseAmount,
      vatRate: poItem.vatRate,
      vatAmount: poItem.vatAmount,
      irpfRate: poItem.irpfRate,
      irpfAmount: poItem.irpfAmount,
      totalAmount: poItem.totalAmount,
    };

    setItems([...items, invoiceItem]);
  };

  const selectAccount = (subAccount: SubAccount) => {
    if (currentItemIndex !== null) {
      updateItem(currentItemIndex, "subAccountId", subAccount.id);
      updateItem(currentItemIndex, "subAccountCode", subAccount.code);
      updateItem(currentItemIndex, "subAccountDescription", subAccount.description);
    }
    setShowAccountModal(false);
    setAccountSearch("");
    setCurrentItemIndex(null);
  };

  const openAccountModal = (index: number) => {
    setCurrentItemIndex(index);
    setShowAccountModal(true);
  };

  const filteredPOs = pos.filter(
    (po) =>
      po.number.toLowerCase().includes(poSearch.toLowerCase()) ||
      po.supplier.toLowerCase().includes(poSearch.toLowerCase())
  );

  const filteredSubAccounts = subAccounts.filter(
    (s) =>
      s.code.toLowerCase().includes(accountSearch.toLowerCase()) ||
      s.description.toLowerCase().includes(accountSearch.toLowerCase()) ||
      s.accountDescription.toLowerCase().includes(accountSearch.toLowerCase())
  );

  const handleFileUpload = (file: File) => {
    // Validate file type
    const validTypes = ["application/pdf", "image/jpeg", "image/png", "image/jpg"];
    if (!validTypes.includes(file.type)) {
      alert("Solo se permiten archivos PDF o imágenes (JPG, PNG)");
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert("El archivo no puede superar los 10MB");
      return;
    }

    setUploadedFile(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileUpload(file);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!uploadedFile) {
      newErrors.file = "Debes adjuntar el archivo de la factura";
    }

    if (formData.invoiceType === "with-po" && !selectedPO) {
      newErrors.po = "Debes seleccionar una PO";
    }

    if (formData.invoiceType === "without-po" && !formData.supplier) {
      newErrors.supplier = "Debes seleccionar un proveedor";
    }

    if (!formData.description.trim()) {
      newErrors.description = "La descripción es obligatoria";
    }

    if (!formData.dueDate) {
      newErrors.dueDate = "La fecha de vencimiento es obligatoria";
    }

    if (items.length === 0) {
      newErrors.items = "Debes agregar al menos un ítem";
    }

    // Validate items
    items.forEach((item, index) => {
      if (!item.description.trim()) {
        newErrors[`item_${index}_description`] = "Descripción obligatoria";
      }
      if (!item.subAccountId) {
        newErrors[`item_${index}_account`] = "Cuenta obligatoria";
      }
      if (item.quantity <= 0) {
        newErrors[`item_${index}_quantity`] = "Cantidad debe ser mayor a 0";
      }
      if (item.unitPrice <= 0) {
        newErrors[`item_${index}_unitPrice`] = "Precio debe ser mayor a 0";
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      alert("Por favor, completa todos los campos obligatorios");
      return;
    }

    setSaving(true);
    try {
      let fileUrl = "";

      // Upload file
      if (uploadedFile) {
        const fileRef = ref(
          storage,
          `projects/${id}/invoices/${nextInvoiceNumber}/${uploadedFile.name}`
        );
        await uploadBytes(fileRef, uploadedFile);
        fileUrl = await getDownloadURL(fileRef);
      }

      // Prepare items data
      const itemsData = items.map((item) => ({
        description: item.description,
        poItemId: item.poItemId || null,
        isNewItem: item.isNewItem,
        subAccountId: item.subAccountId,
        subAccountCode: item.subAccountCode,
        subAccountDescription: item.subAccountDescription,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        baseAmount: item.baseAmount,
        vatRate: item.vatRate,
        vatAmount: item.vatAmount,
        irpfRate: item.irpfRate,
        irpfAmount: item.irpfAmount,
        totalAmount: item.totalAmount,
      }));

      const invoiceData = {
        number: nextInvoiceNumber,
        supplier: formData.supplierName,
        supplierId: formData.supplier,
        poId: selectedPO?.id || null,
        poNumber: selectedPO?.number || null,
        description: formData.description.trim(),
        notes: formData.notes.trim(),
        items: itemsData,
        baseAmount: totals.baseAmount,
        vatAmount: totals.vatAmount,
        irpfAmount: totals.irpfAmount,
        totalAmount: totals.totalAmount,
        status: "pending",
        dueDate: Timestamp.fromDate(new Date(formData.dueDate)),
        attachmentUrl: fileUrl,
        attachmentFileName: uploadedFile?.name || "",
        createdAt: Timestamp.now(),
        createdBy: userId,
        createdByName: userName,
      };

      await addDoc(collection(db, `projects/${id}/invoices`), invoiceData);

      setSuccessMessage("Factura creada correctamente");

      setTimeout(() => {
        router.push(`/project/${id}/accounting/invoices`);
      }, 1500);
    } catch (error) {
      console.error("Error creando factura:", error);
      alert("Error al crear la factura");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className={`flex flex-col min-h-screen bg-white ${inter.className}`}>
        <main className="pt-28 pb-16 px-6 md:px-12 flex-grow flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-slate-200 border-t-emerald-600 rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-slate-600 text-sm font-medium">Cargando...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={`flex flex-col min-h-screen bg-slate-50 ${inter.className}`}>
      {/* Banner superior */}
      <div className="mt-[4.5rem] bg-gradient-to-r from-emerald-50 to-emerald-100 border-y border-emerald-200 px-6 md:px-12 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-600 p-2 rounded-lg">
            <Folder size={16} className="text-white" />
          </div>
          <h1 className="text-sm font-medium text-emerald-900 tracking-tight">
            {projectName}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/project/${id}/accounting/invoices`}
            className="text-emerald-600 hover:text-emerald-900 transition-colors text-sm font-medium"
          >
            Volver a facturas
          </Link>
        </div>
      </div>

      <main className="pb-16 px-6 md:px-12 flex-grow mt-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <header className="mb-8">
            <Link
              href={`/project/${id}/accounting/invoices`}
              className="inline-flex items-center gap-2 text-emerald-600 hover:text-emerald-800 mb-4 text-sm font-medium"
            >
              <ArrowLeft size={16} />
              Volver a facturas
            </Link>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-gradient-to-br from-emerald-500 to-emerald-700 p-3 rounded-xl shadow-lg">
                  <Receipt size={28} className="text-white" />
                </div>
                <div>
                  <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight">
                    Nueva factura
                  </h1>
                  <p className="text-slate-600 text-sm mt-1">
                    INV-{nextInvoiceNumber} • {userName}
                  </p>
                </div>
              </div>
            </div>
          </header>

          {/* Success Message */}
          {successMessage && (
            <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-emerald-700">
              <Check size={20} />
              <span className="font-medium">{successMessage}</span>
            </div>
          )}

          {/* Errors Summary */}
          {Object.keys(errors).length > 0 && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
              <div className="flex items-start gap-2">
                <AlertCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-red-900 mb-1">
                    Hay errores en el formulario:
                  </p>
                  <ul className="text-sm text-red-700 list-disc list-inside">
                    {Object.values(errors).map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Form */}
            <div className="lg:col-span-2 space-y-6">
              {/* Invoice Type Selection */}
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <ShoppingCart size={20} className="text-emerald-600" />
                  Tipo de factura
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button
                    onClick={() => {
                      setFormData({ ...formData, invoiceType: "with-po" });
                      setItems([]);
                      setSelectedPO(null);
                    }}
                    className={`p-6 rounded-xl border-2 transition-all text-left ${
                      formData.invoiceType === "with-po"
                        ? "border-emerald-500 bg-emerald-50"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <FileText size={24} className={formData.invoiceType === "with-po" ? "text-emerald-600" : "text-slate-400"} />
                      {formData.invoiceType === "with-po" && (
                        <CheckCircle size={20} className="text-emerald-600" />
                      )}
                    </div>
                    <h3 className="font-semibold text-slate-900 mb-1">Con PO asociada</h3>
                    <p className="text-sm text-slate-600">
                      Factura vinculada a una orden de compra aprobada
                    </p>
                  </button>

                  <button
                    onClick={() => {
                      setFormData({ ...formData, invoiceType: "without-po" });
                      setItems([]);
                      setSelectedPO(null);
                    }}
                    className={`p-6 rounded-xl border-2 transition-all text-left ${
                      formData.invoiceType === "without-po"
                        ? "border-emerald-500 bg-emerald-50"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <Receipt size={24} className={formData.invoiceType === "without-po" ? "text-emerald-600" : "text-slate-400"} />
                      {formData.invoiceType === "without-po" && (
                        <CheckCircle size={20} className="text-emerald-600" />
                      )}
                    </div>
                    <h3 className="font-semibold text-slate-900 mb-1">Sin PO</h3>
                    <p className="text-sm text-slate-600">
                      Factura independiente sin orden de compra
                    </p>
                  </button>
                </div>
              </div>

              {/* PO Selection (if with-po) */}
              {formData.invoiceType === "with-po" && (
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
                  <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                    <FileText size={20} className="text-emerald-600" />
                    Orden de compra
                  </h2>

                  <button
                    onClick={() => setShowPOModal(true)}
                    className={`w-full px-4 py-3 border-2 ${
                      errors.po ? "border-red-300" : "border-slate-300"
                    } rounded-lg hover:border-emerald-400 transition-colors text-left flex items-center justify-between group`}
                  >
                    {selectedPO ? (
                      <div className="flex items-center gap-2">
                        <FileText size={18} className="text-emerald-600" />
                        <div>
                          <p className="font-medium text-slate-900">PO-{selectedPO.number}</p>
                          <p className="text-sm text-slate-600">{selectedPO.supplier}</p>
                        </div>
                      </div>
                    ) : (
                      <span className="text-slate-400">Seleccionar orden de compra...</span>
                    )}
                    <Search
                      size={18}
                      className="text-slate-400 group-hover:text-emerald-600"
                    />
                  </button>
                  {errors.po && (
                    <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                      <AlertCircle size={12} />
                      {errors.po}
                    </p>
                  )}

                  {/* PO Stats */}
                  {selectedPO && (
                    <div className={`mt-4 p-4 rounded-lg border-2 ${
                      poStats.isOverInvoiced ? "bg-red-50 border-red-200" : "bg-blue-50 border-blue-200"
                    }`}>
                      <div className="flex items-start gap-3">
                        {poStats.isOverInvoiced ? (
                          <AlertTriangle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
                        ) : (
                          <Info size={20} className="text-blue-600 flex-shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1">
                          <p className={`text-sm font-semibold mb-2 ${
                            poStats.isOverInvoiced ? "text-red-900" : "text-blue-900"
                          }`}>
                            {poStats.isOverInvoiced ? "⚠️ Facturación excedida" : "Estado de facturación"}
                          </p>
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                              <p className="text-slate-600">Total PO</p>
                              <p className="font-semibold text-slate-900">
                                {poStats.totalAmount.toLocaleString()} €
                              </p>
                            </div>
                            <div>
                              <p className="text-slate-600">Facturado</p>
                              <p className={`font-semibold ${
                                poStats.isOverInvoiced ? "text-red-600" : "text-emerald-600"
                              }`}>
                                {poStats.invoicedAmount.toLocaleString()} €
                              </p>
                            </div>
                            <div>
                              <p className="text-slate-600">Restante</p>
                              <p className={`font-semibold ${
                                poStats.remainingAmount < 0 ? "text-red-600" : "text-slate-900"
                              }`}>
                                {poStats.remainingAmount.toLocaleString()} €
                              </p>
                            </div>
                            <div>
                              <p className="text-slate-600">Porcentaje</p>
                              <p className={`font-semibold ${
                                poStats.percentageInvoiced > 100 ? "text-red-600" : "text-slate-900"
                              }`}>
                                {poStats.percentageInvoiced.toFixed(1)}%
                              </p>
                            </div>
                          </div>
                          
                          {/* Progress bar */}
                          <div className="mt-3">
                            <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                              <div
                                className={`h-full transition-all ${
                                  poStats.percentageInvoiced > 100
                                    ? "bg-red-500"
                                    : poStats.percentageInvoiced > 90
                                    ? "bg-amber-500"
                                    : "bg-emerald-500"
                                }`}
                                style={{ width: `${Math.min(poStats.percentageInvoiced, 100)}%` }}
                              />
                            </div>
                          </div>

                          {poStats.isOverInvoiced && (
                            <p className="text-xs text-red-700 mt-2">
                              Esta factura excede el importe de la PO. Verifica los importes antes de continuar.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Add PO Items */}
                  {selectedPO && selectedPO.items.length > 0 && (
                    <div className="mt-4">
                      <h3 className="text-sm font-semibold text-slate-900 mb-2">
                        Ítems disponibles en la PO
                      </h3>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {selectedPO.items.map((poItem) => {
                          const alreadyAdded = items.find((item) => item.poItemId === poItem.id);
                          return (
                            <div
                              key={poItem.id}
                              className={`flex items-center justify-between p-3 rounded-lg border ${
                                alreadyAdded
                                  ? "bg-emerald-50 border-emerald-200"
                                  : "bg-slate-50 border-slate-200"
                              }`}
                            >
                              <div className="flex-1">
                                <p className="text-sm font-medium text-slate-900">
                                  {poItem.description}
                                </p>
                                <p className="text-xs text-slate-600">
                                  {poItem.quantity} × {poItem.unitPrice.toLocaleString()} € = {poItem.totalAmount.toLocaleString()} €
                                </p>
                              </div>
                              {alreadyAdded ? (
                                <span className="text-xs bg-emerald-600 text-white px-3 py-1 rounded-full font-medium">
                                  Agregado
                                </span>
                              ) : (
                                <button
                                  onClick={() => addPOItem(poItem)}
                                  className="text-sm bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg font-medium transition-colors"
                                >
                                  Agregar
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Basic Info */}
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <Info size={20} className="text-emerald-600" />
                  Información básica
                </h2>

                <div className="space-y-4">
                  {/* Description */}
                  <div>
                    <label className="block text-sm font-semibold text-slate-900 mb-2">
                      Descripción de la factura *
                    </label>
                    <textarea
                      value={formData.description}
                      onChange={(e) =>
                        setFormData({ ...formData, description: e.target.value })
                      }
                      placeholder="Describe el concepto de la factura..."
                      rows={3}
                      className={`w-full px-4 py-3 border ${
                        errors.description ? "border-red-300" : "border-slate-300"
                      } rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none resize-none`}
                    />
                    {errors.description && (
                      <p className="text-xs text-red-600 mt-1">{errors.description}</p>
                    )}
                  </div>

                  {/* Due Date */}
                  <div>
                    <label className="block text-sm font-semibold text-slate-900 mb-2">
                      Fecha de vencimiento *
                    </label>
                    <div className="relative">
                      <Calendar size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="date"
                        value={formData.dueDate}
                        onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                        className={`w-full pl-10 pr-4 py-3 border ${
                          errors.dueDate ? "border-red-300" : "border-slate-300"
                        } rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none`}
                      />
                    </div>
                    {errors.dueDate && (
                      <p className="text-xs text-red-600 mt-1">{errors.dueDate}</p>
                    )}
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-sm font-semibold text-slate-900 mb-2">
                      Notas internas
                    </label>
                    <textarea
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      placeholder="Añade notas u observaciones..."
                      rows={2}
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none resize-none"
                    />
                  </div>
                </div>
              </div>

              {/* Items */}
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                    <Hash size={20} className="text-emerald-600" />
                    Ítems de la factura ({items.length})
                  </h2>
                  <button
                    onClick={addNewItem}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    <Plus size={16} />
                    Nuevo ítem
                  </button>
                </div>

                {errors.items && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                    {errors.items}
                  </div>
                )}

                <div className="space-y-4">
                  {items.map((item, index) => (
                    <div
                      key={item.id}
                      className="border-2 border-slate-200 rounded-xl p-4 hover:border-emerald-200 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-slate-900">Ítem {index + 1}</h3>
                          {item.isNewItem && (
                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-medium">
                              Nuevo
                            </span>
                          )}
                          {item.poItemId && (
                            <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded font-medium">
                              De PO
                            </span>
                          )}
                        </div>
                        {items.length > 1 && (
                          <button
                            onClick={() => removeItem(index)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>

                      <div className="space-y-3">
                        {/* Description */}
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Descripción *
                          </label>
                          <input
                            type="text"
                            value={item.description}
                            onChange={(e) => updateItem(index, "description", e.target.value)}
                            disabled={!item.isNewItem}
                            placeholder="Descripción del ítem..."
                            className={`w-full px-3 py-2 border ${
                              errors[`item_${index}_description`]
                                ? "border-red-300"
                                : "border-slate-300"
                            } rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none disabled:bg-slate-50`}
                          />
                        </div>

                        {/* Account (only for new items) */}
                        {item.isNewItem && (
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">
                              Cuenta presupuestaria *
                            </label>
                            <button
                              onClick={() => openAccountModal(index)}
                              className={`w-full px-3 py-2 border ${
                                errors[`item_${index}_account`]
                                  ? "border-red-300"
                                  : "border-slate-300"
                              } rounded-lg text-sm text-left flex items-center justify-between hover:border-emerald-400 transition-colors`}
                            >
                              {item.subAccountCode ? (
                                <span className="font-mono text-slate-900">
                                  {item.subAccountCode} - {item.subAccountDescription}
                                </span>
                              ) : (
                                <span className="text-slate-400">Seleccionar cuenta...</span>
                              )}
                              <Search size={14} className="text-slate-400" />
                            </button>
                          </div>
                        )}

                        {/* Quantity, Unit Price */}
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">
                              Cantidad
                            </label>
                            <input
                              type="number"
                              min="1"
                              step="1"
                              value={item.quantity}
                              onChange={(e) =>
                                updateItem(index, "quantity", parseFloat(e.target.value))
                              }
                              disabled={!item.isNewItem}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none disabled:bg-slate-50"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">
                              Precio unitario (€)
                            </label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.unitPrice}
                              onChange={(e) =>
                                updateItem(index, "unitPrice", parseFloat(e.target.value))
                              }
                              disabled={!item.isNewItem}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none disabled:bg-slate-50"
                            />
                          </div>
                        </div>

                        {/* VAT and IRPF (only editable for new items) */}
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">
                              IVA
                            </label>
                            <select
                              value={item.vatRate}
                              onChange={(e) =>
                                updateItem(index, "vatRate", parseFloat(e.target.value))
                              }
                              disabled={!item.isNewItem}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none disabled:bg-slate-50"
                            >
                              {VAT_RATES.map((rate) => (
                                <option key={rate.value} value={rate.value}>
                                  {rate.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">
                              IRPF
                            </label>
                            <select
                              value={item.irpfRate}
                              onChange={(e) =>
                                updateItem(index, "irpfRate", parseFloat(e.target.value))
                              }
                              disabled={!item.isNewItem}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none disabled:bg-slate-50"
                            >
                              {IRPF_RATES.map((rate) => (
                                <option key={rate.value} value={rate.value}>
                                  {rate.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Amounts Summary */}
                        <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                          <div className="grid grid-cols-4 gap-2 text-xs">
                            <div>
                              <p className="text-slate-600">Base</p>
                              <p className="font-semibold text-slate-900">
                                {item.baseAmount.toFixed(2)} €
                              </p>
                            </div>
                            <div>
                              <p className="text-slate-600">IVA</p>
                              <p className="font-semibold text-emerald-600">
                                +{item.vatAmount.toFixed(2)} €
                              </p>
                            </div>
                            <div>
                              <p className="text-slate-600">IRPF</p>
                              <p className="font-semibold text-red-600">
                                -{item.irpfAmount.toFixed(2)} €
                              </p>
                            </div>
                            <div>
                              <p className="text-slate-600">Total</p>
                              <p className="font-bold text-emerald-600 text-sm">
                                {item.totalAmount.toFixed(2)} €
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* File Upload */}
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <Upload size={20} className="text-emerald-600" />
                  Archivo de la factura *
                </h2>

                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
                    isDragging
                      ? "border-emerald-400 bg-emerald-50"
                      : errors.file
                      ? "border-red-300 bg-red-50"
                      : "border-slate-300 hover:border-emerald-400"
                  }`}
                >
                  {uploadedFile ? (
                    <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                      <div className="flex items-center gap-3">
                        <div className="bg-emerald-100 p-2 rounded-lg">
                          <FileText size={24} className="text-emerald-600" />
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-medium text-emerald-900">
                            {uploadedFile.name}
                          </p>
                          <p className="text-xs text-emerald-600">
                            {(uploadedFile.size / 1024).toFixed(0)} KB
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => setUploadedFile(null)}
                        className="p-2 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors"
                      >
                        <X size={20} />
                      </button>
                    </div>
                  ) : (
                    <label className="cursor-pointer block">
                      <Upload size={48} className={`mx-auto mb-3 ${
                        errors.file ? "text-red-400" : "text-slate-400"
                      }`} />
                      <p className={`text-sm font-medium mb-1 ${
                        errors.file ? "text-red-700" : "text-slate-700"
                      }`}>
                        Arrastra tu archivo aquí o haz clic para seleccionar
                      </p>
                      <p className="text-xs text-slate-500">
                        PDF, JPG, PNG (máx. 10MB)
                      </p>
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileUpload(file);
                        }}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
                {errors.file && (
                  <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
                    <AlertCircle size={12} />
                    {errors.file}
                  </p>
                )}
              </div>
            </div>

            {/* Sidebar - Summary */}
            <div className="lg:col-span-1">
              <div className="sticky top-24 space-y-6">
                {/* Totals Card */}
                <div className="bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-xl shadow-lg p-6 text-white">
                  <h3 className="text-sm font-medium text-emerald-100 mb-4">
                    Total de la factura
                  </h3>

                  <div className="space-y-3 mb-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-emerald-100">Base imponible</span>
                      <span className="font-semibold">
                        {totals.baseAmount.toFixed(2)} €
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-emerald-100">IVA</span>
                      <span className="font-semibold text-emerald-200">
                        +{totals.vatAmount.toFixed(2)} €
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-emerald-100">IRPF</span>
                      <span className="font-semibold text-red-300">
                        -{totals.irpfAmount.toFixed(2)} €
                      </span>
                    </div>
                  </div>

                  <div className="border-t border-emerald-400 pt-3">
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-semibold">Total</span>
                      <span className="text-3xl font-bold">
                        {totals.totalAmount.toFixed(2)} €
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions Card */}
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
                  <h3 className="text-sm font-semibold text-slate-900 mb-4">Acciones</h3>

                  <div className="space-y-3">
                    <button
                      onClick={handleSubmit}
                      disabled={saving}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {saving ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          Guardando...
                        </>
                      ) : (
                        <>
                          <Save size={18} />
                          Crear factura
                        </>
                      )}
                    </button>

                    <Link href={`/project/${id}/accounting/invoices`}>
                      <button className="w-full px-4 py-3 border-2 border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium transition-colors">
                        Cancelar
                      </button>
                    </Link>
                  </div>
                </div>

                {/* Info Card */}
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <div className="flex gap-2">
                    <Info size={16} className="text-blue-600 flex-shrink-0 mt-0.5" />
                    <div className="text-xs text-blue-800">
                      <p className="font-semibold mb-1">Importante</p>
                      <ul className="space-y-1">
                        <li>• El archivo de la factura es obligatorio</li>
                        <li>• Los ítems de PO no son editables</li>
                        <li>• Puedes agregar ítems nuevos adicionales</li>
                        <li>• La factura quedará como pendiente de pago</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* PO Selection Modal */}
      {showPOModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[80vh] flex flex-col">
            <div className="bg-gradient-to-r from-emerald-500 to-emerald-700 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <h2 className="text-xl font-bold text-white">Seleccionar orden de compra</h2>
              <button
                onClick={() => {
                  setShowPOModal(false);
                  setPOSearch("");
                }}
                className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6">
              <div className="relative mb-4">
                <Search
                  size={20}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  value={poSearch}
                  onChange={(e) => setPOSearch(e.target.value)}
                  placeholder="Buscar por número o proveedor..."
                  className="w-full pl-10 pr-4 py-3 border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  autoFocus
                />
              </div>

              <div className="max-h-96 overflow-y-auto space-y-2">
                {filteredPOs.length === 0 ? (
                  <p className="text-center text-slate-500 py-8">
                    No se encontraron órdenes de compra aprobadas
                  </p>
                ) : (
                  filteredPOs.map((po) => (
                    <button
                      key={po.id}
                      onClick={() => selectPO(po)}
                      className="w-full text-left p-4 border-2 border-slate-200 rounded-lg hover:border-emerald-400 hover:bg-emerald-50 transition-all group"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-semibold text-slate-900 group-hover:text-emerald-700">
                              PO-{po.number}
                            </p>
                            <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded">
                              {po.status}
                            </span>
                          </div>
                          <p className="text-sm text-slate-600">{po.supplier}</p>
                          <p className="text-xs text-slate-500 mt-1">
                            {po.items.length} ítems
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-slate-900">
                            {po.amount.toLocaleString()} €
                          </p>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Account Modal */}
      {showAccountModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[80vh] flex flex-col">
            <div className="bg-gradient-to-r from-emerald-500 to-emerald-700 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <h2 className="text-xl font-bold text-white">
                Seleccionar cuenta presupuestaria
              </h2>
              <button
                onClick={() => {
                  setShowAccountModal(false);
                  setAccountSearch("");
                  setCurrentItemIndex(null);
                }}
                className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6">
              <div className="relative mb-4">
                <Search
                  size={20}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  value={accountSearch}
                  onChange={(e) => setAccountSearch(e.target.value)}
                  placeholder="Buscar por código o descripción..."
                  className="w-full pl-10 pr-4 py-3 border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  autoFocus
                />
              </div>

              <div className="max-h-96 overflow-y-auto space-y-2">
                {filteredSubAccounts.length === 0 ? (
                  <p className="text-center text-slate-500 py-8">
                    No se encontraron cuentas
                  </p>
                ) : (
                  filteredSubAccounts.map((subAccount) => (
                    <button
                      key={subAccount.id}
                      onClick={() => selectAccount(subAccount)}
                      className="w-full text-left p-4 border-2 border-slate-200 rounded-lg hover:border-emerald-400 hover:bg-emerald-50 transition-all group"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <p className="font-mono font-semibold text-slate-900 group-hover:text-emerald-700">
                            {subAccount.code}
                          </p>
                          <p className="text-sm text-slate-700">
                            {subAccount.description}
                          </p>
                          <p className="text-xs text-slate-500 mt-1">
                            {subAccount.accountCode} - {subAccount.accountDescription}
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-2 text-xs">
                        <div>
                          <p className="text-slate-600">Presupuestado</p>
                          <p className="font-semibold text-slate-900">
                            {subAccount.budgeted.toLocaleString()} €
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-600">Comprometido</p>
                          <p className="font-semibold text-amber-600">
                            {subAccount.committed.toLocaleString()} €
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-600">Realizado</p>
                          <p className="font-semibold text-emerald-600">
                            {subAccount.actual.toLocaleString()} €
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-600">Disponible</p>
                          <p
                            className={`font-bold ${
                              subAccount.available < 0
                                ? "text-red-600"
                                : subAccount.available < subAccount.budgeted * 0.1
                                ? "text-amber-600"
                                : "text-emerald-600"
                            }`}
                          >
                            {subAccount.available.toLocaleString()} €
                          </p>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}