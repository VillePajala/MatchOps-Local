"use client";

import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { HiOutlineXMark } from "react-icons/hi2";

interface UpdateBannerProps {
  onUpdate: () => void;
  notes?: string;
  onDismiss?: () => void;
}

const UpdateBanner: React.FC<UpdateBannerProps> = ({ onUpdate, notes, onDismiss }) => {
  const { t } = useTranslation();
  const [hidden, setHidden] = useState(false);

  if (hidden) return null;

  const handleDismiss = () => {
    setHidden(true);
    onDismiss?.();
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-md bg-gradient-to-r from-slate-800 to-slate-900 text-white p-4 rounded-xl shadow-2xl border border-slate-700/50 z-50">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <p className="text-sm font-medium mb-1">{t("updateBanner.message")}</p>
          {notes && <p className="text-xs text-slate-400">{notes}</p>}
        </div>
        <button
          onClick={handleDismiss}
          className="text-slate-500 hover:text-slate-300 transition-colors"
          aria-label={t("updateBanner.dismissButton")}
        >
          <HiOutlineXMark className="w-5 h-5" />
        </button>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          onClick={onUpdate}
          className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg text-sm transition-all hover:shadow-lg"
        >
          {t("updateBanner.reloadButton")}
        </button>
      </div>
    </div>
  );
};

export default UpdateBanner;
