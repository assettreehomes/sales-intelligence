'use client';

import { toast, type ToastOptions } from 'react-toastify';

const baseToastOptions: ToastOptions = {
    position: 'top-right',
    autoClose: 3200,
    hideProgressBar: false,
    closeOnClick: true,
    pauseOnHover: true,
    draggable: true
};

export function notifySuccess(message: string, options?: ToastOptions) {
    return toast.success(message, { ...baseToastOptions, ...options });
}

export function notifyError(message: string, options?: ToastOptions) {
    return toast.error(message, { ...baseToastOptions, ...options });
}

export function notifyInfo(message: string, options?: ToastOptions) {
    return toast.info(message, { ...baseToastOptions, ...options });
}

export function notifyWarning(message: string, options?: ToastOptions) {
    return toast.warning(message, { ...baseToastOptions, ...options });
}
