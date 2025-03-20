// client/src/app/(page)/login/page.tsx
"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { loginUser } from "@/lib/api"; // Import the login function
import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/solid";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passwordVisible, setPasswordVisible] = useState(false);

  const togglePasswordVisibility = () => {
    setPasswordVisible(!passwordVisible);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null); // Clear previous errors

    try {
      // Use the new API client login function
      await loginUser({ email, password });
      
      // If successful, redirect to dashboard
      router.push("/dashboard");
    } catch (err: any) {
      // Handle login failures
      setError(err.message || "Login failed. Please check your credentials.");
      console.error("Login error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-6 flex justify-stretch items-stretch h-screen">
      <div className="bg-white flex flex-grow">
        {/* Imagen */}
        <div className="w-3/5 flex items-center justify-between gap-7">
          <div className="w-full relative min-h-full">
            <Image
              src="/img/login.jpeg"
              alt="Decorative"
              fill
              className="flex items-center w-full object-cover content-start rounded-2xl"
            />
          </div>
        </div>

        {/* Login */}
        <div className="w-2/5 flex flex-col p-4">
          <div className="flex flex-col items-center justify-between h-full">
            {/* Container of Form and Return button */}
            <div className="flex w-full h-full justify-center items-center">
              <div className="flex flex-col items-center justify-center max-w-md w-full space-y-8 p-10">
                <h2 className="text-center text-5xl font-extrabold text-orange-500">
                  Ankidemy
                </h2>
                <form className="mt-8 space-y-6 w-full" onSubmit={handleSubmit}>
                  <input type="hidden" name="remember" value="true" />
                  <div className="rounded-md -space-y-px">
                    <div className="mb-6">
                      <label htmlFor="email_id" className="sr-only">
                        Email address
                      </label>
                      <input
                        id="email_id"
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                        className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-gray-500 focus:border-gray-500 focus:z-10 sm:text-sm"
                        placeholder="Email address"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                    <div className="relative mb-6">
                      <label htmlFor="password" className="sr-only">
                        Password
                      </label>
                      <input
                        id="password"
                        name="password"
                        type={passwordVisible ? "text" : "password"}
                        autoComplete="current-password"
                        required
                        className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-gray-500 focus:border-gray-500 focus:z-10 sm:text-sm"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        style={{ paddingRight: '2.5rem' }} // Adjust padding to account for icon
                      />
                      <button
                        type="button"
                        onClick={togglePasswordVisibility}
                        className="absolute inset-y-0 right-0 flex items-center px-2 text-gray-600 hover:text-gray-900 focus:outline-none"
                      >
                        {passwordVisible ? (
                          <EyeSlashIcon className="h-5 w-5" aria-hidden="true" />
                        ) : (
                          <EyeIcon className="h-5 w-5" aria-hidden="true" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <button
                      type="submit"
                      className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-orange-400 hover:bg-orange-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
                      disabled={isLoading}
                    >
                      {isLoading ? "Logging in..." : "Iniciar sesion"}
                    </button>
                  </div>

                  {/* Error Message Display */}
                  {error && (
                    <div className="text-red-500 text-sm text-center">
                      {error}
                    </div>
                  )}

                  {/* Contrasena olvidada */}
                  <div className="text-sm text-center">
                    <Link
                      href="/forgot-password"
                      className="font-medium text-gray-800 hover:text-gray-600"
                    >
                      Olvidaste tu contraseña?
                    </Link>
                  </div>
                </form>
              </div>
            </div>
            {/* Regresar */}
            <div className="absolute text-center bottom-10">
              <span
                onClick={() => window.history.back()}
                className="text-black px-3 py-2 hover:text-gray-600 cursor-pointer"
              >
                <span className="text-2xl mr-2">←</span> Regresar
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
