"use client";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Inter, Space_Grotesk } from "next/font/google";
import { useState, useEffect } from "react";
import { auth, db, storage } from "@/lib/firebase";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  addDoc,
  Timestamp,
  query,
  orderBy,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import {
  Folder,
  FileText,
  Upload,
  Users,
  Send,
  X,
  AlertCircle,
  Download,
  Calendar,
  Search,
  Mail,
  Shield,
  Package,
  ChevronRight,
  Clock,
  FileCheck,
  Paperclip,
  MessageSquare,
} from "lucide-react";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "700"] });

interface TeamMember {
  id: string;
  name: string;
  email: string;
  department: string;
  role: string;
}

interface DocumentGroup {
  id: string;
  name: string;
  description: string;
  memberIds: string[];
  color: string;
}

interface SentDocument {
  id: string;
  fileName?: string;
  fileUrl?: string;
  watermark?: string;
  subject?: string;
  message?: string;
  type: "document" | "email";
  sentTo: string[];
  sentToNames: string[];
  groupId?: string;
  groupName?: string;
  sentBy: string;
  sentByName: string;
  sentAt: Date;
  downloadCount: number;
}

const PREDEFINED_GROUPS: DocumentGroup[] = [
  { id: "rodaje", name: "Rodaje", description: "Equipo de rodaje completo", memberIds: [], color: "blue" },
  { id: "direccion", name: "Dirección", description: "Equipo de dirección", memberIds: [], color: "purple" },
  { id: "produccion", name: "Producción", description: "Equipo de producción", memberIds: [], color: "emerald" },
  { id: "arte", name: "Arte", description: "Departamento de arte", memberIds: [], color: "rose" },
  { id: "fotografia", name: "Fotografía", description: "Departamento de fotografía", memberIds: [], color: "amber" },
];

const WATERMARK_OPTIONS = [
  { value: "confidential", label: "CONFIDENCIAL" },
  { value: "draft", label: "BORRADOR" },
  { value: "final", label: "FINAL" },
  { value: "personal", label: "Personalizado" },
];

const groupColors: Record<string, { bg: string; border: string; text: string; light: string }> = {
  blue: { bg: "bg-blue-100", border: "border-blue-200", text: "text-blue-700", light: "bg-blue-50" },
  purple: { bg: "bg-purple-100", border: "border-purple-200", text: "text-purple-700", light: "bg-purple-50" },
  emerald: { bg: "bg-emerald-100", border: "border-emerald-200", text: "text-emerald-700", light: "bg-emerald-50" },
  rose: { bg: "bg-rose-100", border: "border-rose-200", text: "text-rose-700", light: "bg-rose-50" },
  amber: { bg: "bg-amber-100", border: "border-amber-200", text: "text-amber-700", light: "bg-amber-50" },
};

export default function DocumentationPage() {
  const params = useParams();
  const id = params?.id as string;
  const [projectName, setProjectName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [activeTab, setActiveTab] = useState<"send" | "history" | "groups">("send");

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [groups, setGroups] = useState<DocumentGroup[]>([]);
  const [sentDocuments, setSentDocuments] = useState<SentDocument[]>([]);
  const [filteredDocuments, setFilteredDocuments] = useState<SentDocument[]>([]);

  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState("");

  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [sendMode, setSendMode] = useState<"document" | "email">("document");

  const [sendForm, setSendForm] = useState({
    sendType: "individual" as "individual" | "group",
    selectedMembers: [] as string[],
    selectedGroup: "",
    watermarkType: "personal" as "confidential" | "draft" | "final" | "personal",
    subject: "",
    message: "",
  });

  const [stats, setStats] = useState({
    totalDocuments: 0,
    sentToday: 0,
    totalRecipients: 0,
    totalEmails: 0,
  });

  useEffect(() => {
    if (id) {
      loadData();
    }
  }, [id]);

  useEffect(() => {
    filterDocuments();
  }, [searchTerm, dateFilter, sentDocuments]);

  const loadData = async () => {
    try {
      setLoading(true);

      const projectDoc = await getDoc(doc(db, "projects", id));
      if (projectDoc.exists()) {
        setProjectName(projectDoc.data().name || "Proyecto");
      }

      const membersSnapshot = await getDocs(collection(db, `projects/${id}/teamMembers`));
      const membersData = membersSnapshot.docs
        .map((doc) => ({
          id: doc.id,
          name: doc.data().name,
          email: doc.data().email,
          department: doc.data().department,
          role: doc.data().role,
        }))
        .filter((m) => m.email);

      setMembers(membersData);

      const groupsSnapshot = await getDocs(collection(db, `projects/${id}/documentGroups`));
      const groupsData = groupsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as DocumentGroup[];

      const allGroups = [...PREDEFINED_GROUPS, ...groupsData];
      setGroups(allGroups);

      const documentsQuery = query(
        collection(db, `projects/${id}/sentDocuments`),
        orderBy("sentAt", "desc")
      );
      const documentsSnapshot = await getDocs(documentsQuery);
      const documentsData = documentsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        sentAt: doc.data().sentAt.toDate(),
      })) as SentDocument[];

      setSentDocuments(documentsData);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const sentToday = documentsData.filter((d) => {
        const docDate = new Date(d.sentAt);
        docDate.setHours(0, 0, 0, 0);
        return docDate.getTime() === today.getTime();
      }).length;

      const totalRecipients = documentsData.reduce((sum, doc) => sum + doc.sentTo.length, 0);
      const totalEmails = documentsData.filter((d) => d.type === "email").length;
      const totalDocs = documentsData.filter((d) => d.type === "document").length;

      setStats({
        totalDocuments: totalDocs,
        sentToday,
        totalRecipients,
        totalEmails,
      });
    } catch (error) {
      console.error("Error cargando datos:", error);
    } finally {
      setLoading(false);
    }
  };

  const filterDocuments = () => {
    let filtered = [...sentDocuments];

    if (searchTerm) {
      filtered = filtered.filter(
        (doc) =>
          doc.fileName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          doc.subject?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          doc.sentToNames.some((name) => name.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    if (dateFilter) {
      const filterDate = new Date(dateFilter);
      filterDate.setHours(0, 0, 0, 0);
      filtered = filtered.filter((doc) => {
        const docDate = new Date(doc.sentAt);
        docDate.setHours(0, 0, 0, 0);
        return docDate.getTime() === filterDate.getTime();
      });
    }

    setFilteredDocuments(filtered);
  };

  const handleFileUpload = (file: File) => {
    const validTypes = ["application/pdf", "image/jpeg", "image/png", "image/jpg"];
    if (!validTypes.includes(file.type)) {
      alert("Solo se permiten archivos PDF o imágenes (JPG, PNG)");
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      alert("El archivo no puede superar los 50MB");
      return;
    }

    setUploadedFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  const toggleMember = (memberId: string) => {
    setSendForm((prev) => ({
      ...prev,
      selectedMembers: prev.selectedMembers.includes(memberId)
        ? prev.selectedMembers.filter((id) => id !== memberId)
        : [...prev.selectedMembers, memberId],
    }));
  };

  const getGroupMembers = (groupId: string) => {
    const group = groups.find((g) => g.id === groupId);
    if (!group) return [];
    return members.filter((m) =>
      group.name === "Rodaje" ? true : m.department.toLowerCase().includes(group.name.toLowerCase())
    );
  };

  const getRecipientCount = () => {
    if (sendForm.sendType === "group" && sendForm.selectedGroup) {
      return getGroupMembers(sendForm.selectedGroup).length;
    }
    return sendForm.selectedMembers.length;
  };

  const handleSend = async () => {
    // Validation
    if (sendMode === "document" && !uploadedFile) {
      alert("Debes seleccionar un archivo");
      return;
    }

    if (sendMode === "email" && !sendForm.subject.trim()) {
      alert("Debes escribir un asunto para el email");
      return;
    }

    if (sendMode === "email" && !sendForm.message.trim()) {
      alert("Debes escribir un mensaje para el email");
      return;
    }

    if (sendForm.sendType === "individual" && sendForm.selectedMembers.length === 0) {
      alert("Debes seleccionar al menos un destinatario");
      return;
    }

    if (sendForm.sendType === "group" && !sendForm.selectedGroup) {
      alert("Debes seleccionar un grupo");
      return;
    }

    setSending(true);
    try {
      let recipients: string[] = [];
      let recipientNames: string[] = [];
      let groupId: string | undefined;
      let groupName: string | undefined;

      if (sendForm.sendType === "group") {
        const groupMembers = getGroupMembers(sendForm.selectedGroup);
        recipients = groupMembers.map((m) => m.id);
        recipientNames = groupMembers.map((m) => m.name);
        const group = groups.find((g) => g.id === sendForm.selectedGroup);
        groupId = group?.id;
        groupName = group?.name;
      } else {
        recipients = sendForm.selectedMembers;
        recipientNames = members.filter((m) => recipients.includes(m.id)).map((m) => m.name);
      }

      let fileUrl: string | undefined;
      let watermarkText: string | undefined;

      if (sendMode === "document" && uploadedFile) {
        const timestamp = Date.now();
        const fileRef = ref(storage, `projects/${id}/documents/${timestamp}_${uploadedFile.name}`);
        await uploadBytes(fileRef, uploadedFile);
        fileUrl = await getDownloadURL(fileRef);

        switch (sendForm.watermarkType) {
          case "confidential": watermarkText = "CONFIDENCIAL"; break;
          case "draft": watermarkText = "BORRADOR"; break;
          case "final": watermarkText = "FINAL"; break;
          case "personal": watermarkText = "PERSONALIZADO"; break;
        }
      }

      await addDoc(collection(db, `projects/${id}/sentDocuments`), {
        type: sendMode,
        fileName: uploadedFile?.name,
        fileUrl,
        watermark: watermarkText,
        subject: sendForm.subject || undefined,
        message: sendForm.message || undefined,
        sentTo: recipients,
        sentToNames: recipientNames,
        groupId,
        groupName,
        sentBy: auth.currentUser?.uid || "",
        sentByName: auth.currentUser?.displayName || auth.currentUser?.email || "Usuario",
        sentAt: Timestamp.now(),
        downloadCount: 0,
      });

      alert(`${sendMode === "document" ? "Documento" : "Email"} enviado correctamente a ${recipients.length} personas`);

      // Reset form
      setUploadedFile(null);
      setSendForm({
        sendType: "individual",
        selectedMembers: [],
        selectedGroup: "",
        watermarkType: "personal",
        subject: "",
        message: "",
      });

      loadData();
      setActiveTab("history");
    } catch (error) {
      console.error("Error enviando:", error);
      alert("Error al enviar");
    } finally {
      setSending(false);
    }
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  if (loading) {
    return (
      <div className={`flex flex-col min-h-screen bg-slate-50 ${inter.className}`}>
        <main className="pt-28 pb-16 px-6 md:px-12 flex-grow flex items-center justify-center">
          <div className="text-center">
            <div className="w-12 h-12 border-[3px] border-slate-200 border-t-emerald-600 rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-slate-500 text-sm font-medium">Cargando...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={`flex flex-col min-h-screen bg-slate-50 ${inter.className}`}>
      {/* Hero Header */}
      <div className="mt-[4rem] bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-500 text-white">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-10">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-emerald-100 mb-6">
            <Link href="/dashboard" className="hover:text-white transition-colors">
              <Folder size={14} />
            </Link>
            <ChevronRight size={14} className="text-emerald-200" />
            <Link href={`/project/${id}/team`} className="text-sm hover:text-white transition-colors">
              Team
            </Link>
            <ChevronRight size={14} className="text-emerald-200" />
            <span className="text-sm text-white font-medium">Documentación</span>
          </div>

          {/* Title */}
          <div className="flex items-center gap-4 mb-8">
            <div className="w-14 h-14 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center">
              <FileText size={26} className="text-white" />
            </div>
            <div>
              <h1 className={`text-3xl font-semibold tracking-tight ${spaceGrotesk.className}`}>
                Documentación
              </h1>
              <p className="text-emerald-100 text-sm mt-0.5">
                Envío de documentos y emails al equipo
              </p>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <FileCheck size={18} className="text-white/80" />
                <span className="text-2xl font-bold">{stats.totalDocuments}</span>
              </div>
              <p className="text-sm text-emerald-100">Documentos</p>
            </div>
            <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <Mail size={18} className="text-white/80" />
                <span className="text-2xl font-bold">{stats.totalEmails}</span>
              </div>
              <p className="text-sm text-emerald-100">Emails</p>
            </div>
            <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <Clock size={18} className="text-amber-300" />
                <span className="text-2xl font-bold">{stats.sentToday}</span>
              </div>
              <p className="text-sm text-emerald-100">Enviados hoy</p>
            </div>
            <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <Users size={18} className="text-white/80" />
                <span className="text-2xl font-bold">{stats.totalRecipients}</span>
              </div>
              <p className="text-sm text-emerald-100">Destinatarios</p>
            </div>
          </div>
        </div>
      </div>

      <main className="pb-16 px-6 md:px-12 flex-grow -mt-6">
        <div className="max-w-7xl mx-auto">
          {/* Tabs */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm mb-6 p-1.5 inline-flex gap-1">
            <button
              onClick={() => setActiveTab("send")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeTab === "send"
                  ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              <Send size={16} />
              Enviar
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeTab === "history"
                  ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              <Calendar size={16} />
              Historial
            </button>
            <button
              onClick={() => setActiveTab("groups")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeTab === "groups"
                  ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              <Users size={16} />
              Grupos
            </button>
          </div>

          {/* Send Tab */}
          {activeTab === "send" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                {/* Send Mode Selector */}
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                  <div className="px-6 py-5 border-b border-slate-100">
                    <h2 className={`font-semibold text-slate-900 ${spaceGrotesk.className}`}>
                      ¿Qué quieres enviar?
                    </h2>
                  </div>
                  <div className="p-6">
                    <div className="grid grid-cols-2 gap-4">
                      <button
                        onClick={() => setSendMode("document")}
                        className={`p-5 rounded-xl border-2 text-left transition-all ${
                          sendMode === "document"
                            ? "border-emerald-500 bg-emerald-50"
                            : "border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 ${
                          sendMode === "document" ? "bg-emerald-100" : "bg-slate-100"
                        }`}>
                          <Paperclip size={22} className={sendMode === "document" ? "text-emerald-600" : "text-slate-500"} />
                        </div>
                        <h3 className={`font-semibold mb-1 ${sendMode === "document" ? "text-emerald-900" : "text-slate-900"}`}>
                          Documento con marca de agua
                        </h3>
                        <p className="text-sm text-slate-500">
                          PDF o imagen con marca de agua personalizada
                        </p>
                      </button>

                      <button
                        onClick={() => setSendMode("email")}
                        className={`p-5 rounded-xl border-2 text-left transition-all ${
                          sendMode === "email"
                            ? "border-emerald-500 bg-emerald-50"
                            : "border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 ${
                          sendMode === "email" ? "bg-emerald-100" : "bg-slate-100"
                        }`}>
                          <MessageSquare size={22} className={sendMode === "email" ? "text-emerald-600" : "text-slate-500"} />
                        </div>
                        <h3 className={`font-semibold mb-1 ${sendMode === "email" ? "text-emerald-900" : "text-slate-900"}`}>
                          Solo email
                        </h3>
                        <p className="text-sm text-slate-500">
                          Envía un mensaje al equipo sin adjuntos
                        </p>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Document Upload (only for document mode) */}
                {sendMode === "document" && (
                  <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                    <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
                      <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                        <Upload size={18} className="text-emerald-600" />
                      </div>
                      <div>
                        <h2 className={`font-semibold text-slate-900 ${spaceGrotesk.className}`}>
                          Subir documento
                        </h2>
                        <p className="text-xs text-slate-500">PDF, JPG o PNG (máx. 50MB)</p>
                      </div>
                    </div>
                    <div className="p-6">
                      <div
                        onDrop={handleDrop}
                        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                        onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
                        className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
                          isDragging ? "border-emerald-400 bg-emerald-50" : "border-slate-200 hover:border-emerald-300"
                        }`}
                      >
                        {uploadedFile ? (
                          <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                            <div className="flex items-center gap-3">
                              <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
                                <FileText size={22} className="text-emerald-600" />
                              </div>
                              <div className="text-left">
                                <p className="font-medium text-emerald-900">{uploadedFile.name}</p>
                                <p className="text-sm text-emerald-600">
                                  {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
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
                            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                              <Upload size={28} className="text-slate-400" />
                            </div>
                            <p className="font-medium text-slate-700 mb-1">
                              Arrastra tu archivo aquí o haz clic para seleccionar
                            </p>
                            <p className="text-sm text-slate-500">PDF, JPG, PNG (máx. 50MB)</p>
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
                    </div>
                  </div>
                )}

                {/* Watermark (only for document mode) */}
                {sendMode === "document" && (
                  <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                    <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
                      <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center">
                        <Shield size={18} className="text-slate-600" />
                      </div>
                      <div>
                        <h2 className={`font-semibold text-slate-900 ${spaceGrotesk.className}`}>
                          Marca de agua
                        </h2>
                        <p className="text-xs text-slate-500">Se aplicará automáticamente al documento</p>
                      </div>
                    </div>
                    <div className="p-6">
                      <div className="grid grid-cols-2 gap-3">
                        {WATERMARK_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            onClick={() => setSendForm({ ...sendForm, watermarkType: option.value as any })}
                            className={`px-4 py-3 rounded-xl border-2 transition-all text-sm font-medium ${
                              sendForm.watermarkType === option.value
                                ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                                : "border-slate-200 text-slate-600 hover:border-slate-300"
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                      {sendForm.watermarkType === "personal" && (
                        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                          <div className="flex gap-2">
                            <AlertCircle size={16} className="text-blue-600 flex-shrink-0 mt-0.5" />
                            <p className="text-sm text-blue-800">
                              Se aplicará el nombre de cada destinatario como marca de agua
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Email Content (for email mode or optional message) */}
                {sendMode === "email" && (
                  <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                    <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                        <Mail size={18} className="text-blue-600" />
                      </div>
                      <div>
                        <h2 className={`font-semibold text-slate-900 ${spaceGrotesk.className}`}>
                          Contenido del email
                        </h2>
                        <p className="text-xs text-slate-500">Escribe el mensaje para los destinatarios</p>
                      </div>
                    </div>
                    <div className="p-6 space-y-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                          Asunto *
                        </label>
                        <input
                          type="text"
                          value={sendForm.subject}
                          onChange={(e) => setSendForm({ ...sendForm, subject: e.target.value })}
                          placeholder="Asunto del email..."
                          className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 text-sm transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                          Mensaje *
                        </label>
                        <textarea
                          value={sendForm.message}
                          onChange={(e) => setSendForm({ ...sendForm, message: e.target.value })}
                          rows={5}
                          placeholder="Escribe tu mensaje..."
                          className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 text-sm transition-all resize-none"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Recipients */}
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                  <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
                    <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                      <Users size={18} className="text-amber-600" />
                    </div>
                    <div>
                      <h2 className={`font-semibold text-slate-900 ${spaceGrotesk.className}`}>
                        Destinatarios
                      </h2>
                      <p className="text-xs text-slate-500">Selecciona quién recibirá el envío</p>
                    </div>
                  </div>
                  <div className="p-6 space-y-4">
                    {/* Send Type */}
                    <div className="flex gap-3">
                      <button
                        onClick={() => setSendForm({ ...sendForm, sendType: "individual", selectedGroup: "" })}
                        className={`flex-1 px-4 py-3 rounded-xl border-2 transition-all font-medium ${
                          sendForm.sendType === "individual"
                            ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                            : "border-slate-200 text-slate-600 hover:border-slate-300"
                        }`}
                      >
                        Individual
                      </button>
                      <button
                        onClick={() => setSendForm({ ...sendForm, sendType: "group", selectedMembers: [] })}
                        className={`flex-1 px-4 py-3 rounded-xl border-2 transition-all font-medium ${
                          sendForm.sendType === "group"
                            ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                            : "border-slate-200 text-slate-600 hover:border-slate-300"
                        }`}
                      >
                        Grupo
                      </button>
                    </div>

                    {/* Group Selection */}
                    {sendForm.sendType === "group" ? (
                      <div className="grid grid-cols-2 gap-3">
                        {groups.slice(0, 6).map((group) => {
                          const colors = groupColors[group.color] || groupColors.blue;
                          const memberCount = getGroupMembers(group.id).length;
                          return (
                            <button
                              key={group.id}
                              onClick={() => setSendForm({ ...sendForm, selectedGroup: group.id })}
                              className={`p-4 rounded-xl border-2 text-left transition-all ${
                                sendForm.selectedGroup === group.id
                                  ? `border-emerald-500 ${colors.light}`
                                  : "border-slate-200 hover:border-slate-300"
                              }`}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <p className="font-semibold text-slate-900">{group.name}</p>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${colors.bg} ${colors.text}`}>
                                  {memberCount}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500">{group.description}</p>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div>
                        <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                          Seleccionar personas ({sendForm.selectedMembers.length})
                        </label>
                        <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                          {members.map((member) => (
                            <label
                              key={member.id}
                              className="flex items-center gap-3 p-3 hover:bg-slate-50 cursor-pointer transition-colors"
                            >
                              <input
                                type="checkbox"
                                checked={sendForm.selectedMembers.includes(member.id)}
                                onChange={() => toggleMember(member.id)}
                                className="w-4 h-4 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500"
                              />
                              <div className="flex-1">
                                <p className="text-sm font-medium text-slate-900">{member.name}</p>
                                <p className="text-xs text-slate-500">{member.department} · {member.role}</p>
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Optional message for documents */}
                    {sendMode === "document" && (
                      <div>
                        <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                          Mensaje (opcional)
                        </label>
                        <textarea
                          value={sendForm.message}
                          onChange={(e) => setSendForm({ ...sendForm, message: e.target.value })}
                          rows={3}
                          placeholder="Añade un mensaje para los destinatarios..."
                          className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 text-sm transition-all resize-none"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Summary Sidebar */}
              <div className="lg:col-span-1">
                <div className="sticky top-24 space-y-6">
                  <div className="bg-gradient-to-br from-emerald-600 to-teal-600 rounded-2xl shadow-lg p-6 text-white">
                    <h3 className="text-sm font-medium text-emerald-100 mb-4">Resumen de envío</h3>

                    <div className="space-y-3 mb-6">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-emerald-100">Tipo</span>
                        <span className="font-semibold text-sm">
                          {sendMode === "document" ? "Documento" : "Email"}
                        </span>
                      </div>
                      {sendMode === "document" && (
                        <>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-emerald-100">Archivo</span>
                            <span className="font-semibold text-xs truncate max-w-[140px]">
                              {uploadedFile?.name || "Sin seleccionar"}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-emerald-100">Marca de agua</span>
                            <span className="font-semibold text-xs">
                              {WATERMARK_OPTIONS.find((o) => o.value === sendForm.watermarkType)?.label}
                            </span>
                          </div>
                        </>
                      )}
                      {sendMode === "email" && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-emerald-100">Asunto</span>
                          <span className="font-semibold text-xs truncate max-w-[140px]">
                            {sendForm.subject || "Sin asunto"}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-emerald-100">Destinatarios</span>
                        <span className="font-bold text-lg">{getRecipientCount()}</span>
                      </div>
                    </div>

                    <button
                      onClick={handleSend}
                      disabled={sending}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white text-emerald-700 rounded-xl font-semibold transition-colors hover:bg-emerald-50 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {sending ? (
                        <>
                          <div className="w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
                          Enviando...
                        </>
                      ) : (
                        <>
                          <Send size={18} />
                          Enviar {sendMode === "document" ? "documento" : "email"}
                        </>
                      )}
                    </button>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <div className="flex gap-2">
                      <AlertCircle size={16} className="text-blue-600 flex-shrink-0 mt-0.5" />
                      <div className="text-xs text-blue-800">
                        <p className="font-semibold mb-1">Importante</p>
                        <ul className="space-y-1">
                          {sendMode === "document" && (
                            <li>• La marca de agua se aplicará automáticamente</li>
                          )}
                          <li>• Los destinatarios recibirán un email</li>
                          <li>• Puedes ver el historial de envíos en la pestaña correspondiente</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* History Tab */}
          {activeTab === "history" && (
            <div className="space-y-6">
              {/* Filters */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex-1 relative">
                    <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Buscar por archivo, asunto o destinatario..."
                      className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 text-sm transition-all"
                    />
                  </div>
                  <input
                    type="date"
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                    className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 text-sm transition-all"
                  />
                </div>
              </div>

              {/* Documents List */}
              {filteredDocuments.length === 0 ? (
                <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl p-16 text-center">
                  <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <FileText size={32} className="text-slate-300" />
                  </div>
                  <h3 className={`text-xl font-semibold text-slate-900 mb-2 ${spaceGrotesk.className}`}>
                    No hay envíos
                  </h3>
                  <p className="text-slate-500">Los documentos y emails enviados aparecerán aquí</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredDocuments.map((doc) => (
                    <div
                      key={doc.id}
                      className="bg-white border border-slate-200 rounded-2xl p-5 hover:border-emerald-300 hover:shadow-lg transition-all"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-4 flex-1">
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                            doc.type === "email" ? "bg-blue-100" : "bg-emerald-100"
                          }`}>
                            {doc.type === "email" ? (
                              <Mail size={22} className="text-blue-600" />
                            ) : (
                              <FileText size={22} className="text-emerald-600" />
                            )}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-semibold text-slate-900">
                                {doc.type === "email" ? doc.subject : doc.fileName}
                              </h3>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${
                                doc.type === "email" 
                                  ? "bg-blue-100 text-blue-700" 
                                  : "bg-emerald-100 text-emerald-700"
                              }`}>
                                {doc.type === "email" ? "Email" : "Documento"}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-3 text-sm text-slate-600 mb-2">
                              {doc.watermark && (
                                <span className="flex items-center gap-1">
                                  <Shield size={14} />
                                  {doc.watermark}
                                </span>
                              )}
                              <span className="flex items-center gap-1">
                                <Users size={14} />
                                {doc.sentTo.length} destinatarios
                              </span>
                              {doc.groupName && (
                                <span className="flex items-center gap-1">
                                  <Package size={14} />
                                  {doc.groupName}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500">
                              Enviado por {doc.sentByName} el {formatDate(doc.sentAt)}
                            </p>
                          </div>
                        </div>
                        {doc.fileUrl && (
                          <a
                            href={doc.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium transition-colors"
                          >
                            <Download size={16} />
                            Descargar
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Groups Tab */}
          {activeTab === "groups" && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {groups.map((group) => {
                const colors = groupColors[group.color] || groupColors.blue;
                const memberCount = getGroupMembers(group.id).length;

                return (
                  <div
                    key={group.id}
                    className={`bg-white border-2 border-slate-200 rounded-2xl p-6 hover:shadow-lg transition-all`}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className={`w-12 h-12 ${colors.bg} rounded-xl flex items-center justify-center`}>
                        <Users size={22} className={colors.text} />
                      </div>
                      <span className={`text-xs ${colors.bg} ${colors.text} px-3 py-1 rounded-full font-semibold`}>
                        {memberCount} personas
                      </span>
                    </div>
                    <h3 className={`text-lg font-semibold text-slate-900 mb-1 ${spaceGrotesk.className}`}>
                      {group.name}
                    </h3>
                    <p className="text-sm text-slate-500">{group.description}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
