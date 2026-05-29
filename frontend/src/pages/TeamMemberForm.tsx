import React, { useState } from "react";
import { db } from "../api";

export default function UniversalUploadForm({ onSuccess }: { onSuccess?: () => void }) {
  const [destination, setDestination] = useState("dashboard"); // "dashboard" or "team"
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    setSuccess(false);
    try {
      const formData = new FormData();
      if (!file) throw new Error("Please select a file.");
      if (destination === "team") {
        if (!name.trim()) throw new Error("Please enter a name.");
        if (!role.trim()) throw new Error("Please enter a role.");
        formData.append("image", file);
        formData.append("name", name);
        formData.append("role", role);
        formData.append("description", desc || "");
        const result = await db.addTeamMember(formData);
        if (!result?.success) throw new Error(result?.message || "Failed to upload team member.");
      } else {
        formData.append("file", file);
        formData.append("title", title);
        formData.append("description", desc);
        const res = await fetch("/api/dashboard-images", {
          method: "POST",
          body: formData,
        });
        if (!res.ok) throw new Error("Failed to upload dashboard image/video.");
      }
      setSuccess(true);
      setFile(null);
      setName("");
      setRole("");
      setTitle("");
      setDesc("");
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setError(err.message || "Unknown error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-6 bg-slate-900 rounded-xl max-w-md mx-auto">
      <h2 className="text-xl font-bold text-white mb-2">Upload New</h2>
      <div className="mb-4">
        <label>
          <input
            type="radio"
            value="dashboard"
            checked={destination === "dashboard"}
            onChange={() => setDestination("dashboard")}
          />
          <span className="ml-1">Dashboard</span>
        </label>
        <label className="ml-6">
          <input
            type="radio"
            value="team"
            checked={destination === "team"}
            onChange={() => setDestination("team")}
          />
          <span className="ml-1">Team Member</span>
        </label>
      </div>
      {success && <div className="text-green-400">Upload successful!</div>}
      {error && <div className="text-red-400">{error}</div>}
      <div>
        <label className="block text-white mb-1">{destination === "team" ? "Image" : "Image/Video"}</label>
        <input
          type="file"
          accept={destination === "team" ? "image/*" : "image/*,video/*"}
          onChange={e => setFile(e.target.files?.[0] || null)}
        />
      </div>
      {destination === "team" ? (
        <>
          <div>
            <label className="block text-white mb-1">Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full rounded px-2 py-1" />
          </div>
          <div>
            <label className="block text-white mb-1">Role</label>
            <input type="text" value={role} onChange={e => setRole(e.target.value)} className="w-full rounded px-2 py-1" />
          </div>
          <div>
            <label className="block text-white mb-1">Description (optional)</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} className="w-full rounded px-2 py-1" />
          </div>
        </>
      ) : (
        <>
          <div>
            <label className="block text-white mb-1">Title</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} className="w-full rounded px-2 py-1" />
          </div>
          <div>
            <label className="block text-white mb-1">Description</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} className="w-full rounded px-2 py-1" />
          </div>
        </>
      )}
      <button type="submit" disabled={submitting} className="bg-green-600 text-white px-4 py-2 rounded">
        {submitting ? (destination === "team" ? "Registering..." : "Uploading...") : (destination === "team" ? "Register" : "Upload")}
      </button>
    </form>
  );
}
