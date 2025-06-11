"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  getCurrentUser,
  updateCurrentUser,
  type User
} from "@/lib/api";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter
} from "@/app/components/core/card";
import { Input } from "@/app/components/core/input";
import { Button } from "@/app/components/core/button";

export default function ProfilePage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    firstName: "",
    lastName: "",
    password: ""
  });
  const [status, setStatus] = useState<string | null>(null);

  // 1) Al cargar, tratamos de obtener al usuario; si falla, redirigimos al login
  useEffect(() => {
    (async () => {
      try {
        const user: User = await getCurrentUser();
        setFormData({
          username: user.username,
          email: user.email,
          firstName: user.firstName || "",
          lastName: user.lastName || "",
          password: ""
        });
      } catch {
        router.push("/login");
      }
    })();
  }, [router]);

  // 2) Manejo de inputs
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));

  // 3) Al enviar, llamamos a la API de actualización
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("Actualizando...");
    try {
      await updateCurrentUser(formData);
      setStatus("¡Datos actualizados!");
    } catch (err: any) {
      setStatus(`Error: ${err.message}`);
    }
  };

  return (
    <div className="container mx-auto p-4 max-w-md mt-20">
      <Card>
        <CardHeader>
          <CardTitle>Edit Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Username
              </label>
              <Input
                name="username"
                value={formData.username}
                onChange={handleChange}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Email
              </label>
              <Input
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                First Name
              </label>
              <Input
                name="firstName"
                value={formData.firstName}
                onChange={handleChange}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Last Name
              </label>
              <Input
                name="lastName"
                value={formData.lastName}
                onChange={handleChange}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                New Password (leave blank to keep current)
              </label>
              <Input
                name="password"
                type="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="********"
              />
            </div>
            <Button type="submit" className="w-full">
              Save Changes
            </Button>
          </form>
        </CardContent>
        <CardFooter>
          {status && <p className="text-center text-sm">{status}</p>}
        </CardFooter>
      </Card>
    </div>
  );
}