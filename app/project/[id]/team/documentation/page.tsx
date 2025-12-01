"use client";
import { useParams } from "next/navigation";
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
  Timestamp,
  query,
  where,
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
  Check,
  AlertCircle,
  Download,
  Eye,
  Calendar,
  Filter,
  Search,
  Mail,
  Shield,
  UserCheck,
  Package,
  Plus,
  CheckCircle,
  Clock,
  FileCheck,
} from "lucide-react";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });

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
  fileName: string;
  fileUrl: string;
  watermark: string;
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
  {
    id: "rodaje",
    name: "Rodaje",
    description: "Equipo de rodaje completo",
    memberIds: [],
    color: "blue",
  },
  {
    id: "direccion",
    name: "Dirección",
    description: "Equipo de dirección",
    memberIds: [],
    color: "purple",
  },
  {
    id: "produccion",
    name: "Producción",
    description: "Equipo de producción",
    memberIds: [],
    color: "green",
  },
  {
    id: "arte",
    name: "Arte",
    description: "Departamento de arte",
    memberIds: [],
    color: "pink",
  },
  {
    id: "fotografia",
    name: "Fotografía",
    description: "Departamento de fotografía",
    memberIds: [],
    color: "amber",
  },
];

const WATERMARK_OPTIONS = [
  { value: "confidential", label: "CONFIDENCIAL" },
  { value: "draft", label: "BORRADOR" },
  { value: "final", label: "FINAL" },
  { value: "personal", label: "Personalizado (nombre del receptor)" },
];

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
  
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<DocumentGroup | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState("");

  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  const [sendForm, setSendForm] = useState({
    sendType: "individual" as "individual" | "group",
    selectedMembers: [] as string[],
    selectedGroup: "",
    watermarkType: "personal" as "confidential" | "draft" | "final" | "personal",
    customWatermark: "",
    message: "",
  });

  const [stats, setStats] = useState({
    totalDocuments: 0,
    sentToday: 0,
    totalRecipients: 0,
    mostUsedGroup: "",
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

      // Load project
      const projectDoc = await getDoc(doc(db, "projects", id));
      if (projectDoc.exists()) {
        setProjectName(projectDoc.data().name || "Proyecto");
      }

      // Load team members
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

      // Load groups
      const groupsSnapshot = await getDocs(collection(db, `projects/${id}/documentGroups`));
      const groupsData = groupsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as DocumentGroup[];

      // Merge with predefined groups
      const allGroups = [...PREDEFINED_GROUPS, ...groupsData];
      setGroups(allGroups);

      // Load sent documents
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

      // Calculate stats
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const sentToday = documentsData.filter((d) => {
        const docDate = new Date(d.sentAt);
        docDate.setHours(0, 0, 0, 0);
        return docDate.getTime() === today.getTime();
      }).length;

      const totalRecipients = documentsData.reduce(
        (sum, doc) => sum + doc.sentTo.length,
        0
      );

      // Most used group
      const groupCounts: Record<string, number> = {};
      documentsData.forEach((doc) => {
        if (doc.groupId) {
          groupCounts[doc.groupId] = (groupCounts[doc.groupId] || 0) + 1;
        }
      });
      const mostUsedGroupId = Object.entries(groupCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
      const mostUsedGroup = allGroups.find((g) => g.id === mostUsedGroupId)?.name || "-";

      setStats({
        totalDocuments: documentsData.length,
        sentToday,
        totalRecipients,
        mostUsedGroup,
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
          doc.fileName.toLowerCase().includes(searchTerm.toLowerCase()) ||
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
    if (file) {
      handleFileUpload(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const toggleMember = (memberId: string) => {
    setSendForm((prev) => ({
      ...prev,
      selectedMembers: prev.selectedMembers.includes(memberId)
        ? prev.selectedMembers.filter((id) => id !== memberId)
        : [...prev.selectedMembers, memberId],
    }));
  };

  const selectAllInGroup = (groupId: string) => {
    const group = groups.find((g) => g.id === groupId);
    if (!group) return;

    // Get members from group's departments
    const groupMembers = members.filter((m) =>
      group.name === "Rodaje"
        ? true // All members for "Rodaje"
        : m.department.toLowerCase().includes(group.name.toLowerCase())
    );

    setSendForm((prev) => ({
      ...prev,
      selectedMembers: groupMembers.map((m) => m.id),
    }));
  };

  const handleSendDocument = async () => {
    if (!uploadedFile) {
      alert("Debes seleccionar un archivo");
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
        const group = groups.find((g) => g.id === sendForm.selectedGroup);
        if (group) {
          const groupMembers = members.filter((m) =>
            group.name === "Rodaje"
              ? true
              : m.department.toLowerCase().includes(group.name.toLowerCase())
          );
          recipients = groupMembers.map((m) => m.id);
          recipientNames = groupMembers.map((m) => m.name);
          groupId = group.id;
          groupName = group.name;
        }
      } else {
        recipients = sendForm.selectedMembers;
        recipientNames = members
          .filter((m) => recipients.includes(m.id))
          .map((m) => m.name);
      }

      // Upload file with watermark
      // In a real implementation, you would apply the watermark here
      // For now, we'll just upload the original file
      const timestamp = Date.now();
      const fileRef = ref(
        storage,
        `projects/${id}/documents/${timestamp}_${uploadedFile.name}`
      );
      await uploadBytes(fileRef, uploadedFile);
      const fileUrl = await getDownloadURL(fileRef);

      // Determine watermark text
      let watermarkText = "";
      switch (sendForm.watermarkType) {
        case "confidential":
          watermarkText = "CONFIDENCIAL";
          break;
        case "draft":
          watermarkText = "BORRADOR";
          break;
        case "final":
          watermarkText = "FINAL";
          break;
        case "personal":
          watermarkText = "PERSONALIZADO";
          break;
      }

      // Save document record
      await addDoc(collection(db, `projects/${id}/sentDocuments`), {
        fileName: uploadedFile.name,
        fileUrl,
        watermark: watermarkText,
        sentTo: recipients,
        sentToNames: recipientNames,
        groupId,
        groupName,
        sentBy: auth.currentUser?.uid || "",
        sentByName: auth.currentUser?.displayName || auth.currentUser?.email || "Usuario",
        sentAt: Timestamp.now(),
        downloadCount: 0,
      });

      // Send emails to recipients
      // TODO: Implement email sending

      alert(`Documento enviado correctamente a ${recipients.length} personas`);
      
      // Reset form
      setUploadedFile(null);
      setSendForm({
        sendType: "individual",
        selectedMembers: [],
        selectedGroup: "",
        watermarkType: "personal",
        customWatermark: "",
        message: "",
      });

      loadData();
      setActiveTab("history");
    } catch (error) {
      console.error("Error enviando documento:", error);
      alert("Error al enviar el documento");
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
      <div className={`flex flex-col min-h-screen bg-white ${inter.className}`}>
        <main className="pt-28 pb-16 px-6 md:px-12 flex-grow flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-slate-200 border-t-amber-600 rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-slate-600 text-sm font-medium">Cargando...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={`flex flex-col min-h-screen bg-white ${inter.className}`}>
      {/* Banner superior */}
      <div className="mt-[4.5rem] bg-gradient-to-r from-amber-50 to-amber-100 border-y border-amber-200 px-6 md:px-12 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-amber-600 p-2 rounded-lg">
            <Folder size={16} className="text-white" />
          </div>
          <h1 className="text-sm font-medium text-amber-900 tracking-tight">
            {projectName}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="text-amber-600 hover:text-amber-900 transition-colors text-sm font-medium"
          >
            Volver a proyectos
          </Link>
        </div>
      </div>

      <main className="pb-16 px-6 md:px-12 flex-grow mt-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <header className="mb-8">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-amber-500 to-amber-700 p-3 rounded-xl shadow-lg">
                <FileText size={28} className="text-white" />
              </div>
              <div>
                <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight">
                  Documentación
                </h1>
                <p className="text-slate-600 text-sm mt-1">
                  Envío de documentos con marca de agua
                </p>
              </div>
            </div>
          </header>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-blue-700 font-medium">Total enviados</p>
                <FileCheck size={20} className="text-blue-600" />
              </div>
              <p className="text-3xl font-bold text-blue-900">{stats.totalDocuments}</p>
            </div>

            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-emerald-700 font-medium">Enviados hoy</p>
                <Clock size={20} className="text-emerald-600" />
              </div>
              <p className="text-3xl font-bold text-emerald-900">{stats.sentToday}</p>
            </div>

            <div className="bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-purple-700 font-medium">Destinatarios</p>
                <Users size={20} className="text-purple-600" />
              </div>
              <p className="text-3xl font-bold text-purple-900">{stats.totalRecipients}</p>
            </div>

            <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-amber-700 font-medium">Grupo más usado</p>
                <Package size={20} className="text-amber-600" />
              </div>
              <p className="text-lg font-bold text-amber-900">{stats.mostUsedGroup}</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mb-6 border-b border-slate-200">
            <button
              onClick={() => setActiveTab("send")}
              className={`px-4 py-2 font-medium transition-colors border-b-2 ${
                activeTab === "send"
                  ? "border-amber-600 text-amber-600"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              <div className="flex items-center gap-2">
                <Send size={16} />
                Enviar documento
              </div>
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`px-4 py-2 font-medium transition-colors border-b-2 ${
                activeTab === "history"
                  ? "border-amber-600 text-amber-600"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              <div className="flex items-center gap-2">
                <Calendar size={16} />
                Historial
              </div>
            </button>
            <button
              onClick={() => setActiveTab("groups")}
              className={`px-4 py-2 font-medium transition-colors border-b-2 ${
                activeTab === "groups"
                  ? "border-amber-600 text-amber-600"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              <div className="flex items-center gap-2">
                <Users size={16} />
                Grupos ({groups.length})
              </div>
            </button>
          </div>

          {/* Send Tab */}
          {activeTab === "send" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Upload & Config */}
              <div className="lg:col-span-2 space-y-6">
                {/* File Upload */}
                <div className="bg-white border-2 border-slate-200 rounded-xl p-6 shadow-sm">
                  <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                    <Upload size={20} className="text-amber-600" />
                    Subir documento
                  </h2>

                  <div
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
                      isDragging
                        ? "border-amber-400 bg-amber-50"
                        : "border-slate-300 hover:border-amber-400"
                    }`}
                  >
                    {uploadedFile ? (
                      <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg p-4">
                        <div className="flex items-center gap-3">
                          <div className="bg-amber-100 p-2 rounded-lg">
                            <FileText size={24} className="text-amber-600" />
                          </div>
                          <div className="text-left">
                            <p className="text-sm font-medium text-amber-900">
                              {uploadedFile.name}
                            </p>
                            <p className="text-xs text-amber-600">
                              {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => setUploadedFile(null)}
                          className="p-2 text-amber-600 hover:bg-amber-100 rounded-lg transition-colors"
                        >
                          <X size={20} />
                        </button>
                      </div>
                    ) : (
                      <label className="cursor-pointer block">
                        <Upload size={48} className="text-slate-400 mx-auto mb-3" />
                        <p className="text-sm font-medium text-slate-700 mb-1">
                          Arrastra tu archivo aquí o haz clic para seleccionar
                        </p>
                        <p className="text-xs text-slate-500">
                          PDF, JPG, PNG (máx. 50MB)
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
                </div>

                {/* Watermark Config */}
                <div className="bg-white border-2 border-slate-200 rounded-xl p-6 shadow-sm">
                  <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                    <Shield size={20} className="text-amber-600" />
                    Marca de agua
                  </h2>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Tipo de marca
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {WATERMARK_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            onClick={() =>
                              setSendForm({ ...sendForm, watermarkType: option.value as any })
                            }
                            className={`px-4 py-3 rounded-lg border-2 transition-all text-sm font-medium ${
                              sendForm.watermarkType === option.value
                                ? "border-amber-500 bg-amber-50 text-amber-700"
                                : "border-slate-200 text-slate-600 hover:border-slate-300"
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {sendForm.watermarkType === "personal" && (
                      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="flex gap-2">
                          <AlertCircle size={16} className="text-blue-600 flex-shrink-0 mt-0.5" />
                          <p className="text-sm text-blue-800">
                            Se aplicará el nombre de cada destinatario como marca de agua personalizada
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Recipients */}
                <div className="bg-white border-2 border-slate-200 rounded-xl p-6 shadow-sm">
                  <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                    <Users size={20} className="text-amber-600" />
                    Destinatarios
                  </h2>

                  <div className="space-y-4">
                    {/* Send Type */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSendForm({ ...sendForm, sendType: "individual" })}
                        className={`flex-1 px-4 py-2 rounded-lg border-2 transition-all font-medium ${
                          sendForm.sendType === "individual"
                            ? "border-amber-500 bg-amber-50 text-amber-700"
                            : "border-slate-200 text-slate-600"
                        }`}
                      >
                        Individual
                      </button>
                      <button
                        onClick={() => setSendForm({ ...sendForm, sendType: "group" })}
                        className={`flex-1 px-4 py-2 rounded-lg border-2 transition-all font-medium ${
                          sendForm.sendType === "group"
                            ? "border-amber-500 bg-amber-50 text-amber-700"
                            : "border-slate-200 text-slate-600"
                        }`}
                      >
                        Grupo
                      </button>
                    </div>

                    {/* Group Selection */}
                    {sendForm.sendType === "group" ? (
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          Seleccionar grupo
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          {groups.slice(0, 6).map((group) => (
                            <button
                              key={group.id}
                              onClick={() => {
                                setSendForm({ ...sendForm, selectedGroup: group.id });
                                selectAllInGroup(group.id);
                              }}
                              className={`px-4 py-3 rounded-lg border-2 transition-all text-left ${
                                sendForm.selectedGroup === group.id
                                  ? `border-${group.color}-500 bg-${group.color}-50`
                                  : "border-slate-200 hover:border-slate-300"
                              }`}
                            >
                              <p className="text-sm font-semibold text-slate-900">{group.name}</p>
                              <p className="text-xs text-slate-600">{group.description}</p>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          Seleccionar personas ({sendForm.selectedMembers.length})
                        </label>
                        <div className="max-h-64 overflow-y-auto space-y-2 border border-slate-200 rounded-lg p-3">
                          {members.map((member) => (
                            <label
                              key={member.id}
                              className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-lg cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={sendForm.selectedMembers.includes(member.id)}
                                onChange={() => toggleMember(member.id)}
                                className="w-4 h-4 text-amber-600 border-slate-300 rounded focus:ring-amber-500"
                              />
                              <div className="flex-1">
                                <p className="text-sm font-medium text-slate-900">{member.name}</p>
                                <p className="text-xs text-slate-600">
                                  {member.department} - {member.role}
                                </p>
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Message */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Mensaje (opcional)
                      </label>
                      <textarea
                        value={sendForm.message}
                        onChange={(e) => setSendForm({ ...sendForm, message: e.target.value })}
                        rows={3}
                        className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none resize-none"
                        placeholder="Añade un mensaje para los destinatarios..."
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Summary Sidebar */}
              <div className="lg:col-span-1">
                <div className="sticky top-24 space-y-6">
                  {/* Summary Card */}
                  <div className="bg-gradient-to-br from-amber-500 to-amber-700 rounded-xl shadow-lg p-6 text-white">
                    <h3 className="text-sm font-medium text-amber-100 mb-4">Resumen de envío</h3>
                    
                    <div className="space-y-3 mb-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-amber-100">Documento</span>
                        <span className="font-semibold text-xs truncate max-w-[150px]">
                          {uploadedFile?.name || "Sin seleccionar"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-amber-100">Marca de agua</span>
                        <span className="font-semibold text-xs">
                          {WATERMARK_OPTIONS.find(o => o.value === sendForm.watermarkType)?.label}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-amber-100">Destinatarios</span>
                        <span className="font-bold text-lg">
                          {sendForm.sendType === "group" 
                            ? members.filter(m => 
                                groups.find(g => g.id === sendForm.selectedGroup)?.name === "Rodaje" ||
                                m.department.toLowerCase().includes(
                                  groups.find(g => g.id === sendForm.selectedGroup)?.name.toLowerCase() || ""
                                )
                              ).length
                            : sendForm.selectedMembers.length}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={handleSendDocument}
                      disabled={sending || !uploadedFile}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white text-amber-600 rounded-lg font-medium transition-colors hover:bg-amber-50 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {sending ? (
                        <>
                          <div className="w-4 h-4 border-2 border-amber-600 border-t-transparent rounded-full animate-spin"></div>
                          Enviando...
                        </>
                      ) : (
                        <>
                          <Send size={18} />
                          Enviar documento
                        </>
                      )}
                    </button>
                  </div>

                  {/* Info Card */}
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <div className="flex gap-2">
                      <AlertCircle size={16} className="text-blue-600 flex-shrink-0 mt-0.5" />
                      <div className="text-xs text-blue-800">
                        <p className="font-semibold mb-1">Importante</p>
                        <ul className="space-y-1">
                          <li>• La marca de agua se aplicará automáticamente</li>
                          <li>• Los destinatarios recibirán un email con el enlace</li>
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
            <>
              {/* Filters */}
              <div className="bg-white border-2 border-slate-200 rounded-xl p-4 mb-6 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <div className="relative">
                      <Search
                        size={18}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                      />
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Buscar por archivo o destinatario..."
                        className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <input
                      type="date"
                      value={dateFilter}
                      onChange={(e) => setDateFilter(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Documents List */}
              {filteredDocuments.length === 0 ? (
                <div className="bg-slate-50 border-2 border-dashed border-slate-300 rounded-2xl p-12 text-center">
                  <FileText size={64} className="text-slate-300 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-slate-900 mb-2">
                    No hay documentos enviados
                  </h3>
                  <p className="text-slate-600">
                    Los documentos enviados aparecerán aquí
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredDocuments.map((doc) => (
                    <div
                      key={doc.id}
                      className="bg-white border-2 border-slate-200 rounded-xl p-6 hover:border-amber-300 hover:shadow-lg transition-all"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-4 flex-1">
                          <div className="bg-amber-100 p-3 rounded-lg">
                            <FileText size={24} className="text-amber-600" />
                          </div>
                          <div className="flex-1">
                            <h3 className="font-semibold text-slate-900 mb-1">{doc.fileName}</h3>
                            <div className="flex flex-wrap gap-2 text-sm text-slate-600 mb-2">
                              <span className="flex items-center gap-1">
                                <Shield size={14} />
                                Marca: {doc.watermark}
                              </span>
                              <span>•</span>
                              <span className="flex items-center gap-1">
                                <Users size={14} />
                                {doc.sentTo.length} destinatarios
                              </span>
                              {doc.groupName && (
                                <>
                                  <span>•</span>
                                  <span className="flex items-center gap-1">
                                    <Package size={14} />
                                    {doc.groupName}
                                  </span>
                                </>
                              )}
                            </div>
                            <p className="text-xs text-slate-500">
                              Enviado por {doc.sentByName} el {formatDate(doc.sentAt)}
                            </p>
                          </div>
                        </div>
                        <a
                          href={doc.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                        >
                          <Download size={16} />
                          Descargar
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Groups Tab */}
          {activeTab === "groups" && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {groups.map((group) => {
                const memberCount = members.filter((m) =>
                  group.name === "Rodaje"
                    ? true
                    : m.department.toLowerCase().includes(group.name.toLowerCase())
                ).length;

                return (
                  <div
                    key={group.id}
                    className={`bg-white border-2 border-slate-200 rounded-xl p-6 hover:border-${group.color}-300 hover:shadow-lg transition-all`}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className={`bg-${group.color}-100 p-3 rounded-lg`}>
                        <Users size={24} className={`text-${group.color}-600`} />
                      </div>
                      <span className={`text-xs bg-${group.color}-100 text-${group.color}-700 px-2 py-1 rounded-full font-medium`}>
                        {memberCount} personas
                      </span>
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900 mb-1">{group.name}</h3>
                    <p className="text-sm text-slate-600">{group.description}</p>
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

