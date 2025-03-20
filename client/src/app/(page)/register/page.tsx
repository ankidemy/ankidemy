"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { registerUser } from "@/lib/api"; // Import the register function
import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/solid";

export default function Register() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const togglePasswordVisibility = () => {
    setPasswordVisible(!passwordVisible);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      // Use the new API client register function
      await registerUser({ 
        username, 
        email, 
        password,
        firstName: firstName || undefined, 
        lastName: lastName || undefined
      });

      // If successful, redirect to login page
      router.push("/login");
    } catch (err: any) {
      setError(err.message || "Registration failed. Please try again.");
      console.error("Registration error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-6 flex justify-stretch items-stretch h-screen">
      <div className="bg-white flex flex-grow">
        {/* Image */}
        <div className="w-3/5 flex items-center justify-between gap-7">
          <div className="w-full relative min-h-full">
            <Image
              src="/img/register.jpeg"
              alt="Decorative"
              fill
              className="flex items-center w-full object-cover content-start rounded-2xl"
            />
          </div>
        </div>

        {/* Registration Form */}
        <div className="w-2/5 flex flex-col p-4">
          <div className="flex flex-col items-center justify-between h-full">
            <div className="flex w-full h-full justify-center items-center">
              <div className="flex flex-col items-center justify-center max-w-md w-full space-y-8 p-10">
                <h2 className="text-center text-5xl font-extrabold text-orange-500">
                  Registrar
                </h2>
                <form className="mt-8 space-y-6 w-full" onSubmit={handleSubmit}>
                  <div className="rounded-md">
                    <div className="mb-6">
                      <label htmlFor="username" className="sr-only">
                        Username
                      </label>
                      <input
                        id="username"
                        name="username"
                        type="text"
                        required
                        className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-gray-500 focus:border-gray-500 focus:z-10 sm:text-sm"
                        placeholder="Username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                      />
                    </div>
                    <div className="mb-6">
                      <label htmlFor="firstName" className="sr-only">
                        First Name
                      </label>
                      <input
                        id="firstName"
                        name="firstName"
                        type="text"
                        className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-gray-500 focus:border-gray-500 focus:z-10 sm:text-sm"
                        placeholder="First Name"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                      />
                    </div>
                    <div className="mb-6">
                      <label htmlFor="lastName" className="sr-only">
                        Last Name
                      </label>
                      <input
                        id="lastName"
                        name="lastName"
                        type="text"
                        className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-gray-500 focus:border-gray-500 focus:z-10 sm:text-sm"
                        placeholder="Last Name"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                      />
                    </div>
                    <div className="mb-6">
                      <label htmlFor="email" className="sr-only">
                        Email
                      </label>
                      <input
                        id="email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                        className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-gray-500 focus:border-gray-500 focus:z-10 sm:text-sm"
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
                        autoComplete="new-password"
                        required
                        className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-gray-500 focus:border-gray-500 focus:z-10 sm:text-sm pr-10"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={togglePasswordVisibility}
                        className="absolute inset-y-0 right-0 flex items-center px-2 text-gray-600 hover:text-gray-900"
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
                      {isLoading ? "Registering..." : "Register"}
                    </button>
                  </div>

                  {/* Error Message Display */}
                  {error && (
                    <div className="text-red-500 text-sm text-center">
                      {error}
                    </div>
                  )}

                  {/* Already have an account */}
                  <div className="text-sm text-center">
                    <Link
                      href="/login"
                      className="font-medium text-gray-800 hover:text-gray-600"
                    >
                      Ya tienes cuenta? Log in
                    </Link>
                  </div>
                </form>
              </div>
            </div>
            {/* Back */}
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
