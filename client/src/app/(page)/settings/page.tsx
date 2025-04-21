"use client";

import { useState, useEffect } from "react";
import { Button } from "@/app/components/core/button";
import { useRouter } from "next/navigation";
import { getCurrentUser } from "@/lib/api";

export default function SettingsPage() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const user = await getCurrentUser();
        console.log("Usuario actual:", user);
        if (!user) {
          router.push("/login"); // Redirige si no hay sesión
        }
      } catch (err) {
        console.error("Error al obtener usuario:", err);
        router.push("/login");
      }
    };
  
    checkAuth();
  }, []);

  if (loading) {
    return <p className="text-center text-gray-500 py-10">Loading profile...</p>;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold text-orange-500 mb-8">Profile Settings</h1>

      <form className="space-y-6">
        {/* Nombre de usuario */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de usuario</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
        </div>

        {/* Correo */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Correo electrónico</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
        </div>

        {/* Contraseña (placeholder) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
          <input
            type="password"
            placeholder="********"
            disabled
            className="w-full px-4 py-2 border rounded-lg bg-gray-100 text-gray-500"
          />
          <p className="text-sm text-gray-500 mt-1">Cambiar contraseña estará disponible próximamente.</p>
        </div>

        <div className="pt-4">
          <Button type="submit" className="bg-orange-500 hover:bg-orange-400 text-white">
            Guardar cambios
          </Button>
        </div>
      </form>
    </div>
  );
}