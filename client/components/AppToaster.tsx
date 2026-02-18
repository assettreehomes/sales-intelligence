'use client';

import { ToastContainer } from 'react-toastify';

export function AppToaster() {
    return (
        <ToastContainer
            position="top-right"
            autoClose={3200}
            hideProgressBar={false}
            newestOnTop
            closeOnClick
            pauseOnHover
            draggable
            theme="colored"
        />
    );
}
