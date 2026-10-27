"use client";

import React from "react";
import ModalShell from "@/components/ModalShell";
import PartCompatibilityAssigner from "@/components/inventory/PartCompatibilityAssigner";

interface PartCompatibilityModalProps {
  isOpen: boolean;
  onClose: () => void;
  partId?: string;
  partName?: string;
  partCode?: string;
  // Khi dùng để chọn trong form thêm/sửa linh kiện
  isPickerOnly?: boolean;
  initialSelectedModels?: string[];
  onApplyModels?: (models: string[]) => void;
  onSaved?: (partId: string, updatedModels: string[]) => void;
}

export default function PartCompatibilityModal({
  isOpen,
  onClose,
  partId,
  partName,
  partCode,
  isPickerOnly = false,
  initialSelectedModels,
  onApplyModels,
  onSaved,
}: PartCompatibilityModalProps) {
  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="d-flex align-items-center gap-2">
          <i className="fas fa-microchip text-primary fs-5"></i>
          <div>
            <div className="fw-bold">
              {isPickerOnly
                ? "Chọn Dòng máy tương thích cho Linh kiện"
                : `Gán Dòng máy tương thích: ${partCode ? `[${partCode}] ` : ""}${partName || ""}`}
            </div>
            <div className="small text-white-50 fw-normal" style={{ fontSize: "11px" }}>
              Đánh dấu chọn (check / uncheck) các dòng máy photocopy, máy in tương thích với linh kiện này
            </div>
          </div>
        </div>
      }
      size="xl"
      headerClass="bg-dark text-white"
    >
      <div className="p-1">
        <PartCompatibilityAssigner
          initialPartId={partId}
          isModalPicker={isPickerOnly}
          selectedModelsValue={initialSelectedModels}
          onApplyModels={(models) => {
            if (onApplyModels) onApplyModels(models);
            onClose();
          }}
          onSaved={(savedPartId, models) => {
            if (onSaved) onSaved(savedPartId, models);
            onClose();
          }}
          onCancel={onClose}
        />
      </div>
    </ModalShell>
  );
}
