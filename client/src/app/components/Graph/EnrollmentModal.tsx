// src/app/components/Graph/EnrollmentModal.tsx
"use client";

import React, { useState } from 'react';
import { Button } from "@/app/components/core/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/app/components/core/card";
import { X, Users, AlertCircle, CheckCircle } from 'lucide-react';
import { enrollInDomain, Domain } from '@/lib/api';
import { showToast } from '@/app/components/core/ToastNotification';

interface EnrollmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  domain: Domain | null;
  onEnrollmentSuccess: () => void;
  onContinueWithoutEnrollment: () => void;
}

const EnrollmentModal: React.FC<EnrollmentModalProps> = ({
  isOpen,
  onClose,
  domain,
  onEnrollmentSuccess,
  onContinueWithoutEnrollment
}) => {
  const [isEnrolling, setIsEnrolling] = useState(false);

  if (!isOpen || !domain) return null;

  const handleEnroll = async () => {
    setIsEnrolling(true);
    try {
      await enrollInDomain(domain.id);
      showToast(`Successfully enrolled in "${domain.name}"`, 'success');
      onEnrollmentSuccess();
    } catch (error) {
      console.error('Error enrolling in domain:', error);
      showToast(`Failed to enroll in "${domain.name}"`, 'error');
    } finally {
      setIsEnrolling(false);
    }
  };

  const handleContinueWithoutEnrollment = () => {
    onContinueWithoutEnrollment();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="border-b">
          <div className="flex justify-between items-center">
            <CardTitle className="flex items-center">
              <Users className="mr-2 h-5 w-5 text-orange-500" />
              Domain Enrollment
            </CardTitle>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X size={18} />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="pt-6">
          <div className="text-center mb-6">
            <h3 className="text-lg font-semibold mb-2">{domain.name}</h3>
            <p className="text-gray-600 text-sm mb-4">
              {domain.description || "This is a public domain available for exploration."}
            </p>
          </div>

          {/* Enrollment Benefits */}
          <div className="space-y-3 mb-6">
            <h4 className="font-medium text-sm text-gray-700">With enrollment, you get:</h4>
            <div className="space-y-2">
              <div className="flex items-center text-sm">
                <CheckCircle size={16} className="text-green-500 mr-2 flex-shrink-0" />
                <span>Progress tracking and statistics</span>
              </div>
              <div className="flex items-center text-sm">
                <CheckCircle size={16} className="text-green-500 mr-2 flex-shrink-0" />
                <span>Spaced repetition study sessions</span>
              </div>
              <div className="flex items-center text-sm">
                <CheckCircle size={16} className="text-green-500 mr-2 flex-shrink-0" />
                <span>Review history and analytics</span>
              </div>
              <div className="flex items-center text-sm">
                <CheckCircle size={16} className="text-green-500 mr-2 flex-shrink-0" />
                <span>Full access to study features</span>
              </div>
            </div>
          </div>

          {/* Limited Access Warning */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6">
            <div className="flex items-start">
              <AlertCircle size={16} className="text-amber-600 mr-2 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-amber-800">Limited Access Mode</p>
                <p className="text-amber-700 mt-1">
                  You can browse the domain without enrolling, but study features will be disabled.
                </p>
              </div>
            </div>
          </div>
        </CardContent>

        <CardFooter className="flex flex-col space-y-2 pt-0">
          <Button
            onClick={handleEnroll}
            disabled={isEnrolling}
            className="w-full bg-orange-500 hover:bg-orange-600"
          >
            {isEnrolling ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                Enrolling...
              </>
            ) : (
              <>
                <Users size={16} className="mr-2" />
                Enroll in Domain
              </>
            )}
          </Button>
          
          <Button
            variant="outline"
            onClick={handleContinueWithoutEnrollment}
            disabled={isEnrolling}
            className="w-full"
          >
            Browse Without Enrolling
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

export default EnrollmentModal;
