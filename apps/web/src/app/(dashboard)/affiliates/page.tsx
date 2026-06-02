"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Pencil,
  Trash2,
  Link2,
  ExternalLink,
  Search,
  Loader2,
  X,
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface AffiliateLink {
  id: string;
  productName: string;
  keywords: string[];
  url: string;
  platform: string | null;
  clickCount: number;
  isActive: boolean;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

export default function AffiliatesPage() {
  const { getToken } = useAuth();
  const [links, setLinks] = useState<AffiliateLink[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [editingLink, setEditingLink] = useState<AffiliateLink | null>(null);
  const [newLink, setNewLink] = useState({
    name: "",
    url: "",
    keywords: "",
  });

  // Fetch affiliate links
  const fetchLinks = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/api/affiliate-links`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setLinks(
          data.affiliateLinks.map((l: Record<string, unknown>) => ({
            id: l.id,
            productName: l.name,
            keywords: l.triggerKeywords || [],
            url: l.url,
            platform: null,
            clickCount: l.clickCount || 0,
            isActive: l.isActive,
          }))
        );
      }
    } catch (error) {
      console.error("Failed to fetch affiliate links:", error);
    } finally {
      setIsLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);

  // Create new link
  const handleCreate = async () => {
    if (!newLink.name || !newLink.url) {
      console.error("Name and URL are required");
      return;
    }

    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/api/affiliate-links`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          productName: newLink.name,
          affiliateUrl: newLink.url,
          keywords: newLink.keywords
            .split(",")
            .map((k) => k.trim())
            .filter(Boolean),
        }),
      });

      if (res.ok) {
        setNewLink({ name: "", url: "", keywords: "" });
        setIsCreating(false);
        fetchLinks();
      } else {
        console.error("Failed to create link");
      }
    } catch (error) {
      console.error("Failed to create link:", error);
    }
  };

  // Update existing link
  const handleUpdate = async () => {
    if (!editingLink || !newLink.name || !newLink.url) {
      console.error("Name and URL are required");
      return;
    }

    try {
      const token = await getToken();
      const res = await fetch(
        `${API_URL}/api/affiliate-links/${editingLink.id}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            productName: newLink.name,
            affiliateUrl: newLink.url,
            keywords: newLink.keywords
              .split(",")
              .map((k) => k.trim())
              .filter(Boolean),
          }),
        }
      );

      if (res.ok) {
        setNewLink({ name: "", url: "", keywords: "" });
        setEditingLink(null);
        fetchLinks();
      } else {
        console.error("Failed to update link");
      }
    } catch (error) {
      console.error("Failed to update link:", error);
    }
  };

  // Toggle active status
  const toggleActive = async (id: string, currentStatus: boolean) => {
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/api/affiliate-links/${id}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ isActive: !currentStatus }),
      });

      if (res.ok) {
        setLinks((prev) =>
          prev.map((link) =>
            link.id === id ? { ...link, isActive: !currentStatus } : link
          )
        );
      }
    } catch (error) {
      console.error("Failed to toggle link:", error);
    }
  };

  // Delete link
  const handleDelete = async (id: string) => {
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/api/affiliate-links/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        setLinks((prev) => prev.filter((link) => link.id !== id));
      }
    } catch (error) {
      console.error("Failed to delete link:", error);
    }
  };

  const filteredLinks = links.filter(
    (link) =>
      link.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      link.keywords.some((k) =>
        k.toLowerCase().includes(searchQuery.toLowerCase())
      )
  );

  if (isLoading) {
    return (
      <>
        <Header
          title="Affiliate Links"
          description="Manage your product links and keywords"
        />
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
        </div>
      </>
    );
  }

  return (
    <>
      <Header
        title="Affiliate Links"
        description="Manage your product links and keywords"
      />

      <div className="p-6 space-y-6">
        {/* Actions Bar */}
        <div className="flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Search products or keywords..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-10 pl-10 pr-4 rounded-lg border border-zinc-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
            />
          </div>
          <Button onClick={() => setIsCreating(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Link
          </Button>
        </div>

        {/* Create/Edit Modal */}
        {(isCreating || editingLink) && (
          <Card className="border-2 border-zinc-900">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg">
                {editingLink ? "Edit Affiliate Link" : "Add New Affiliate Link"}
              </CardTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setIsCreating(false);
                  setEditingLink(null);
                  setNewLink({ name: "", url: "", keywords: "" });
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-zinc-700">
                  Product Name
                </label>
                <input
                  type="text"
                  value={newLink.name}
                  onChange={(e) =>
                    setNewLink((p) => ({ ...p, name: e.target.value }))
                  }
                  placeholder="e.g., Logitech G Pro X Superlight"
                  className="w-full mt-1 h-10 px-3 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-zinc-700">
                  Affiliate URL
                </label>
                <input
                  type="url"
                  value={newLink.url}
                  onChange={(e) =>
                    setNewLink((p) => ({ ...p, url: e.target.value }))
                  }
                  placeholder="https://amzn.to/..."
                  className="w-full mt-1 h-10 px-3 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-zinc-700">
                  Keywords (comma-separated)
                </label>
                <input
                  type="text"
                  value={newLink.keywords}
                  onChange={(e) =>
                    setNewLink((p) => ({ ...p, keywords: e.target.value }))
                  }
                  placeholder="mouse, gaming mouse, logitech"
                  className="w-full mt-1 h-10 px-3 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                />
              </div>
              <Button
                onClick={editingLink ? handleUpdate : handleCreate}
                className="w-full"
              >
                {editingLink ? "Update Link" : "Create Link"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-zinc-100 flex items-center justify-center">
                  <Link2 className="h-5 w-5 text-zinc-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-zinc-900">
                    {links.length}
                  </p>
                  <p className="text-sm text-zinc-500">Total Links</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <Link2 className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-zinc-900">
                    {links.filter((l) => l.isActive).length}
                  </p>
                  <p className="text-sm text-zinc-500">Active</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <ExternalLink className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-zinc-900">
                    {links.reduce((acc, l) => acc + l.clickCount, 0)}
                  </p>
                  <p className="text-sm text-zinc-500">Total Clicks</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Links List */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Your Products</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {links.length === 0 ? (
              <div className="p-8 text-center text-zinc-500">
                <Link2 className="h-12 w-12 mx-auto mb-4 text-zinc-300" />
                <p className="font-medium">No affiliate links yet</p>
                <p className="text-sm mt-1">
                  Add your first link to start tracking
                </p>
              </div>
            ) : (
              <motion.div
                variants={container}
                initial="hidden"
                animate="show"
                className="divide-y divide-zinc-100"
              >
                <AnimatePresence>
                  {filteredLinks.map((link) => (
                    <motion.div
                      key={link.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="flex items-center gap-4 p-4 hover:bg-zinc-50 transition-colors"
                    >
                      {/* Toggle Switch */}
                      <button
                        onClick={() => toggleActive(link.id, link.isActive)}
                        className={`relative h-6 w-11 rounded-full transition-colors ${
                          link.isActive ? "bg-emerald-500" : "bg-zinc-200"
                        }`}
                      >
                        <motion.div
                          initial={false}
                          animate={{ x: link.isActive ? 20 : 2 }}
                          className="absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm"
                        />
                      </button>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-zinc-900 truncate">
                            {link.productName}
                          </p>
                          {link.platform && (
                            <Badge variant="outline">{link.platform}</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1.5">
                          {link.keywords.slice(0, 3).map((keyword) => (
                            <Badge
                              key={keyword}
                              variant="secondary"
                              className="text-xs"
                            >
                              {keyword}
                            </Badge>
                          ))}
                          {link.keywords.length > 3 && (
                            <span className="text-xs text-zinc-400">
                              +{link.keywords.length - 3} more
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Stats */}
                      <div className="text-right">
                        <p className="font-medium text-zinc-900">
                          {link.clickCount}
                        </p>
                        <p className="text-xs text-zinc-500">clicks</p>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => {
                            setEditingLink(link);
                            setNewLink({
                              name: link.productName,
                              url: link.url,
                              keywords: link.keywords.join(", "),
                            });
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
                          onClick={() => handleDelete(link.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </motion.div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
