import React, { useState } from 'react';

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
    src?: string | null;
    name: string;
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    onlineStatus?: boolean;
    className?: string;
}

export function Avatar({
    src,
    name,
    size = 'md',
    onlineStatus,
    className = '',
    ...props
}: AvatarProps) {
    const [imgError, setImgError] = useState(false);

    const initials = name
        ? name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
        : '??';

    const colors = [
        'bg-purple-500',
        'bg-indigo-500',
        'bg-violet-500',
        'bg-fuchsia-500',
        'bg-blue-500',
        'bg-emerald-500'
    ];

    const colorIdx = name
        ? name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % colors.length
        : 0;

    const sizeClasses = {
        xs: 'w-6 h-6 text-[10px]',
        sm: 'w-8 h-8 text-xs',
        md: 'w-10 h-10 text-sm',
        lg: 'w-16 h-16 text-xl',
        xl: 'w-24 h-24 text-3xl'
    };

    const statusSizeClasses = {
        xs: 'w-1.5 h-1.5',
        sm: 'w-2 h-2',
        md: 'w-3 h-3',
        lg: 'w-4 h-4',
        xl: 'w-5 h-5'
    };

    const sizeClass = sizeClasses[size];
    const statusSizeClass = statusSizeClasses[size];

    return (
        <div className={`relative inline-block ${className}`} {...props}>
            {src && !imgError ? (
                <img
                    src={src}
                    alt={name}
                    className={`${sizeClass} rounded-full object-cover shadow-sm border border-gray-100`}
                    onError={() => setImgError(true)}
                />
            ) : (
                <div className={`${sizeClass} ${colors[colorIdx]} rounded-full flex items-center justify-center text-white font-bold shadow-sm`}>
                    {initials}
                </div>
            )}

            {typeof onlineStatus === 'boolean' && (
                <span className={`absolute bottom-0 right-0 block ${statusSizeClass} rounded-full ring-2 ring-white ${onlineStatus ? 'bg-green-500' : 'bg-gray-300'}`} />
            )}
        </div>
    );
}
