import { createContext, useRef, useState, ReactNode, Dispatch, SetStateAction } from "react";

interface HttpResponse<T = unknown> {
    status: number;
    ok: boolean;
    data?: T | null;
    error?: string;
}

interface HttpOptions extends RequestInit {
    headers?: Record<string, string>;
}

export interface UserContextType {
    user: unknown | undefined;
    setUser: Dispatch<SetStateAction<unknown | undefined>>;
    httpFetch: <T = unknown>(endpoint: string, options?: HttpOptions) => Promise<HttpResponse<T>>;
    inputRef: React.RefObject<HTMLInputElement | null>;
}

export const UserContext = createContext<UserContextType | null>(null);

export const UserProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<unknown | undefined>(undefined);
    const inputRef = useRef<HTMLInputElement | null>(null);

    async function httpFetch<T = unknown>(endpoint: string, options: HttpOptions = {}) {
        const req = await httpFetchWithCredentials<T>(endpoint, options);

        if (req.status === 403) {
            setUser(undefined);

            if (import.meta.env.DEV) {
                console.warn("Session expired please login again (403 expected)");
            } else {
                console.warn("Session expired please login again (403 expected)");
            }
        }

        if (endpoint === "/verify/me") {
            setUser(req.data);
        }

        return req;
    }

    return (
        <UserContext.Provider value={{ user, setUser, httpFetch, inputRef }}>
            {children}
        </UserContext.Provider>
    );
};

async function httpFetchWithCredentials<T = unknown>(endpoint: string, options: HttpOptions = {}): Promise<HttpResponse<T>> {
    const apiDomain = import.meta.env.VITE_API_URL;
    const defaultOptions: HttpOptions = {
        credentials: "include",
        headers: {
            "600": "BasicPass",
            "Content-Type": "application/json",
            ...options.headers,
        },
    };

    if (import.meta.env.MODE === "development") {
        defaultOptions.headers = {
            ...defaultOptions.headers,
            ga6n1fa4fcvt: "EiDcafRc45$td4aedrgh4615tokenbtw",
        };
    }

    const finalOptions = { ...defaultOptions, ...options };

    try {
        const res = await fetch(apiDomain + endpoint, finalOptions);
        const contentType = res.headers.get("content-type");

        let data: T | null = null;
        if (contentType && contentType.includes("application/json")) {
            data = await res.json();
        }

        return {
            status: res.status,
            ok: res.ok,
            data,
        };
    } catch (error) {
        return {
            status: 0,
            ok: false,
            error: error instanceof Error ? error.message : "Debug this case",
        };
    }
}
