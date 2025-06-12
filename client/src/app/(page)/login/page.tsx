// client/src/app/(page)/login/page.tsx
"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { loginUser, checkAuthStatus } from "@/lib/api"; // Import the updated login function
import { Eye, EyeOff, ArrowLeft, AlertCircle, CheckCircle } from "lucide-react";

// Validation functions
const validateIdentifier = (identifier: string): string | null => {
  if (!identifier) return "Email or username is required";
  if (identifier.length < 3) return "Email or username must be at least 3 characters long";
  return null;
};

const validatePassword = (password: string): string | null => {
  if (!password) return "Password is required";
  return null;
};

// Helper function to parse backend error messages
const parseBackendError = (error: string): string => {
  if (error.includes("Invalid credentials") || error.includes("Unauthorized")) {
    return "Invalid email/username or password. Please check your credentials and try again.";
  }
  if (error.includes("Authentication required")) {
    return "Please check your email/username and password.";
  }
  if (error.includes("Bad Request")) {
    return "Please check your login information and try again.";
  }
  
  // Return a user-friendly version of the error
  return "Login failed. Please check your credentials and try again.";
};

export default function ImprovedLoginPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    identifier: "",
    password: "",
  });
  
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [touchedFields, setTouchedFields] = useState<Record<string, boolean>>({});
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Check if user is already authenticated on component mount
  useEffect(() => {
    const checkExistingAuth = async () => {
      try {
        const authStatus = await checkAuthStatus();
        if (authStatus.isAuthenticated) {
          console.log("User already authenticated, redirecting to dashboard");
          router.push("/dashboard");
          return;
        }
      } catch (error) {
        console.log("No existing authentication found");
        // User is not authenticated, continue with login page
      } finally {
        setCheckingAuth(false);
      }
    };

    checkExistingAuth();
  }, [router]);

  const togglePasswordVisibility = () => {
    setPasswordVisible(!passwordVisible);
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear field error when user starts typing
    if (fieldErrors[field]) {
      setFieldErrors(prev => ({ ...prev, [field]: "" }));
    }
    
    // Clear general error when user starts typing
    if (error) {
      setError(null);
    }
    
    // Clear success message when user starts typing
    if (success) {
      setSuccess(null);
    }
  };

  const handleBlur = (field: string) => {
    setTouchedFields(prev => ({ ...prev, [field]: true }));
    validateField(field, formData[field as keyof typeof formData]);
  };

  const validateField = (field: string, value: string) => {
    let fieldError = "";
    
    switch (field) {
      case "identifier":
        fieldError = validateIdentifier(value) || "";
        break;
      case "password":
        fieldError = validatePassword(value) || "";
        break;
    }
    
    setFieldErrors(prev => ({ ...prev, [field]: fieldError }));
    return fieldError === "";
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    
    const identifierError = validateIdentifier(formData.identifier);
    const passwordError = validatePassword(formData.password);
    
    if (identifierError) errors.identifier = identifierError;
    if (passwordError) errors.password = passwordError;
    
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    setError(null);
    setSuccess(null);
    
    // Mark all fields as touched
    setTouchedFields({
      identifier: true,
      password: true,
    });
    
    // Validate form
    if (!validateForm()) {
      return;
    }
    
    setIsLoading(true);

    try {
      // Use the updated API client login function with identifier
      await loginUser({
        identifier: formData.identifier,
        password: formData.password,
      });
      
      setSuccess("Login successful! Redirecting to dashboard...");
      
      // Short delay to show success message
      setTimeout(() => {
        router.push("/dashboard");
      }, 1000);
      
    } catch (err: any) {
      const errorMessage = parseBackendError(err.message || "Login failed. Please try again.");
      setError(errorMessage);
      console.error("Login error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  const isFormValid = () => {
    return formData.identifier && 
           formData.password && 
           Object.values(fieldErrors).every(error => error === "");
  };

  // Show loading spinner while checking authentication
  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  return (
    <div className="p-6 flex justify-stretch items-stretch min-h-screen bg-gray-50">
      <div className="bg-white flex flex-grow rounded-lg shadow-xl overflow-hidden">
        {/* Image */}
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

        {/* Login Form */}
        <div className="w-2/5 flex flex-col p-8 relative">
          <div className="flex flex-col justify-center h-full max-w-md mx-auto w-full">
            <div className="text-center mb-8">
              <h2 className="text-4xl font-extrabold text-orange-500 mb-2">
                Ankidemy
              </h2>
              <p className="text-gray-600">Welcome back! Please sign in to your account</p>
            </div>

            <div className="space-y-6">
              {/* Identifier Field (Email or Username) */}
              <div>
                <label htmlFor="identifier" className="block text-sm font-medium text-gray-700 mb-1">
                  Email or Username *
                </label>
                <input
                  id="identifier"
                  type="text"
                  className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 ${
                    fieldErrors.identifier && touchedFields.identifier
                      ? "border-red-300 focus:border-red-500"
                      : "border-gray-300 focus:border-orange-500"
                  }`}
                  placeholder="Enter your email or username"
                  value={formData.identifier}
                  onChange={(e) => handleInputChange("identifier", e.target.value)}
                  onBlur={() => handleBlur("identifier")}
                  onKeyPress={handleKeyPress}
                />
                {fieldErrors.identifier && touchedFields.identifier && (
                  <div className="mt-1 flex items-center text-sm text-red-600">
                    <AlertCircle className="w-4 h-4 mr-1" />
                    {fieldErrors.identifier}
                  </div>
                )}
              </div>

              {/* Password Field */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  Password *
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={passwordVisible ? "text" : "password"}
                    className={`w-full px-3 py-2 pr-10 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 ${
                      fieldErrors.password && touchedFields.password
                        ? "border-red-300 focus:border-red-500"
                        : "border-gray-300 focus:border-orange-500"
                    }`}
                    placeholder="Enter your password"
                    value={formData.password}
                    onChange={(e) => handleInputChange("password", e.target.value)}
                    onBlur={() => handleBlur("password")}
                    onKeyPress={handleKeyPress}
                  />
                  <button
                    type="button"
                    onClick={togglePasswordVisibility}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600"
                  >
                    {passwordVisible ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                {fieldErrors.password && touchedFields.password && (
                  <div className="mt-1 flex items-center text-sm text-red-600">
                    <AlertCircle className="w-4 h-4 mr-1" />
                    {fieldErrors.password}
                  </div>
                )}
              </div>

              {/* Submit Button */}
              <button
                onClick={handleSubmit}
                disabled={isLoading || !isFormValid()}
                className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-orange-500 hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? "Signing in..." : "Sign In"}
              </button>

              {/* Error Message */}
              {error && (
                <div className="rounded-md bg-red-50 border border-red-200 p-4">
                  <div className="flex items-start">
                    <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 mr-3 flex-shrink-0" />
                    <div>
                      <h3 className="text-sm font-medium text-red-800">
                        Login Failed
                      </h3>
                      <div className="mt-1 text-sm text-red-700">
                        {error}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Success Message */}
              {success && (
                <div className="rounded-md bg-green-50 border border-green-200 p-4">
                  <div className="flex items-start">
                    <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 mr-3 flex-shrink-0" />
                    <div>
                      <h3 className="text-sm font-medium text-green-800">
                        Success!
                      </h3>
                      <div className="mt-1 text-sm text-green-700">
                        {success}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Forgot Password Link */}
              <div className="text-center">
                <Link
                  href="/forgot-password"
                  className="text-sm text-gray-600 hover:text-gray-800 transition-colors"
                >
                  Forgot your password?
                </Link>
              </div>

              {/* Register Link */}
              <div className="text-center">
                <span className="text-sm text-gray-600">
                  Don't have an account?{" "}
                  <Link href="/register" className="font-medium text-orange-600 hover:text-orange-500">
                    Sign up
                  </Link>
                </span>
              </div>
            </div>
          </div>

          {/* Back Button */}
          <div className="absolute bottom-6 left-6">
            <Link href="/" className="flex items-center text-gray-600 hover:text-gray-800 transition-colors">
              <ArrowLeft className="w-5 h-5 mr-2" />
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
