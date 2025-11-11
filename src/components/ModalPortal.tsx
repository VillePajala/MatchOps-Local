'use client';

import React from 'react';
import { createPortal } from 'react-dom';

interface ModalPortalProps {
  children: React.ReactNode;
}

const ModalPortal: React.FC<ModalPortalProps> = ({ children }) => {
  if (typeof document === 'undefined') {
    // SSR/No DOM: render nothing (modals are client-only)
    return null;
  }
  return createPortal(children, document.body);
};

export default ModalPortal;

