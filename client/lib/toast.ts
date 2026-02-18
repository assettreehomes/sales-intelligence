'use client';

import { toast, type ToastOptions } from 'react-hot-toast';

type AppToastOptions = ToastOptions & {
    toastId?: string;
};

const baseToastOptions: ToastOptions = {
    position: 'top-right',
    duration: 3200
};

function withToastId(options?: AppToastOptions): ToastOptions {
    if (!options) {
        return baseToastOptions;
    }

    const { toastId, ...rest } = options;
    return {
        ...baseToastOptions,
        ...rest,
        ...(toastId ? { id: toastId } : {})
    };
}

export function notifySuccess(message: string, options?: AppToastOptions) {
    return toast.success(message, withToastId(options));
}

export function notifyError(message: string, options?: AppToastOptions) {
    return toast.error(message, withToastId(options));
}

export function notifyInfo(message: string, options?: AppToastOptions) {
    return toast(message, { icon: '??', ...withToastId(options) });
}

export function notifyWarning(message: string, options?: AppToastOptions) {
    return toast(message, { icon: '??', ...withToastId(options) });
}
