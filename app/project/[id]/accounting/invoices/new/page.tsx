"use client";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Inter } from "next/font/google";
import { useState, useEffect } from "react";
import { auth, db, storage } from "@/lib/firebase";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  addDoc,
  query,
  orderBy,
  where,
  Timestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import {
  Receipt,
  ArrowLeft,
  Plus,
  Trash2,
  Upload,
  X,
  AlertCircle,
  CheckCircle2,
  Search,
  FileText,
  Calendar,
  Building2,
  Info,
  Link as LinkIcon,
  Shield,
  FileCheck,
  Clock,
} from "lucide-react";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

// Tipos de documento
const DOCUMENT_TYPES = {
  invoice: {
    code: "FAC",
    label: "Factura",
    description: "Factura definitiva del proveedor",
    icon: Receipt,
    color: "emerald",
    requiresReplacement: false,
  },
  proforma: {
    code: "PRF",
    label: "Proforma",
    description: "Factura proforma - requiere factura definitiva tras el pago",
    icon: FileText,
    color: "violet",
    requiresReplacement: true,
  },
  budget: {
    code: "PRS",
    label: "Presupuesto",
    description: "Presupuesto aprobado - requiere factura definitiva tras el pago",
    icon: FileCheck,
    color: "amber",
    requiresReplacement: true,
  },
  guarantee: {
    code: "FNZ",
    label: "Fianza",
    description: "Fianza o depósito de garantía",
    icon: Shield,
    color: "slate",
    requiresReplacement: false,
  },
};

type DocumentType = keyof typeof DOCUMENT_TYPES;

interface Supplier {
  id: string;
  name: string;
  taxId: string;
  email: string;
}

interface PO {
  id: string;
  number: string;
  supplier: string;
  supplierId: string;
  status: string;
  totalAmount: number;
}

interface SubAccount {
  id: string;
  code: string;
  description: string;
  accountId: string;
  accountCode: string;
}

interface InvoiceItem {
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

interface PendingDocument {
  id: string;
  type: DocumentType;
  number: string;
  supplier: string;
  totalAmount: number;
  paidAt: Date;
}

export default function NewInvoicePage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [projectName, setProjectName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState("");

  // Document type
  const [documentType, setDocumentType] = useState<DocumentType>("invoice");

  // Form data
  const [number, setNumber] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");

  // Supplier
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);

  // PO linking
  const [availablePOs, setAvailablePOs] = useState<PO[]>([]);
  const [selectedPOId, setSelectedPOId] = useState("");

  // Link to pending proforma/budget (for invoices only)
  const [pendingDocuments, setPendingDocuments] = useState<PendingDocument[]>([]);
  const [linkedDocumentId, setLinkedDocumentId] = useState("");

  // Items
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [subAccounts, setSubAccounts] = useState<SubAccount[]>([]);

  // File
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // Messages
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Approval config
  const [approvalSteps, setApprovalSteps] = useState<any[]>([]);

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
    if (userId && id) loadData();
  }, [userId, id]);

  useEffect(() => {
    // Filter POs when supplier changes
    if (selectedSupplierId) {
      loadPOsForSupplier(selectedSupplierId);
    } else {
      setAvailablePOs([]);
      setSelectedPOId("");
    }
  }, [selectedSupplierId]);

  const loadData = async () => {
    try {
      setLoading(true);

      // Project
      const projectDoc = await getDoc(doc(db, "projects", id));
      if (projectDoc.exists()) {
        setProjectName(projectDoc.data().name || "Proyecto");
      }

      // Suppliers
      const suppliersSnap = await getDocs(
        query(collection(db, `projects/${id}/suppliers`), orderBy("name", "asc"))
      );
      setSuppliers(
        suppliersSnap.docs.map((d) => ({
          id: d.id,
          name: d.data().name,
          taxId: d.data().taxId || "",
          email: d.data().email || "",
        }))
      );

      // SubAccounts
      const accountsSnap = await getDocs(collection(db, `projects/${id}/accounts`));
      const allSubAccounts: SubAccount[] = [];

      for (const accountDoc of accountsSnap.docs) {
        const accountData = accountDoc.data();
        const subAccountsSnap = await getDocs(
          collection(db, `projects/${id}/accounts/${accountDoc.id}/subaccounts`)
        );

        subAccountsSnap.docs.forEach((subDoc) => {
          const subData = subDoc.data();
          allSubAccounts.push({
            id: subDoc.id,
            code: subData.code,
            description: subData.description,
            accountId: accountDoc.id,
            accountCode: accountData.code,
          });
        });
      }

      setSubAccounts(allSubAccounts.sort((a, b) => a.code.localeCompare(b.code)));

      // Approval config
      const configDoc = await getDoc(doc(db, `projects/${id}/config/approvals`));
      if (configDoc.exists()) {
        const config = configDoc.data();
        if (config.invoiceSteps?.length > 0) {
          setApprovalSteps(
            config.invoiceSteps.map((step: any) => ({
              ...step,
              status: "pending",
              approvedAt: null,
              approvedBy: null,
            }))
          );
        }
      }

      // Pending documents (proformas/budgets paid but without definitive invoice)
      const invoicesSnap = await getDocs(
        query(
          collection(db, `projects/${id}/invoices`),
          where("status", "==", "paid"),
          where("requiresReplacement", "==", true),
          where("replacedByInvoiceId", "==", null)
        )
      );

      const pending: PendingDocument[] = invoicesSnap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          type: data.documentType || "proforma",
          number: data.number,
          supplier: data.supplier,
          totalAmount: data.totalAmount,
          paidAt: data.paidAt?.toDate() || new Date(),
        };
      });

      setPendingDocuments(pending);
    } catch (error) {
      console.error("Error loading data:", error);
      setError("Error al cargar los datos");d-lg p-2">
                          <p className="text-emerald-600">Realizado</p>
                          <p className="font-semibold text-emerald-700">
                            {formatCurrency(sub.actual)} €
                          </p>
                        </div>
                        <div className={`rounded-lg p-2 ${
                          sub.available < 0
                            ? "bg-red-50"
                            : sub.available < sub.budgeted * 0.1
                            ? "bg-amber-50"
                            : "bg-emerald-50"
                        }`}>
                          <p className={`${
                            sub.available < 0
                              ? "text-red-600"
                              : sub.available < sub.budgeted * 0.1
                              ? "text-amber-600"
                              : "text-emerald-600"
                          }`}>Disponible</p>
                          <p className={`font-semibold ${
                            sub.available < 0
                              ? "text-red-700"
                              : sub.available < sub.budgeted * 0.1
                              ? "text-amber-700"
                              : "text-emerald-700"
                          }`}>
                            {formatCurrency(sub.available)} €
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
