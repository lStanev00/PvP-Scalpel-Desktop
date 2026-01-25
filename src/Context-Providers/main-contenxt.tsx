import {
    createContext,
    useRef,
    useState,
    ReactNode,
    Dispatch,
    SetStateAction,
    useCallback,
} from "react";
import { Fingerprint } from "../Helpers/getFingerprint";
import { invoke } from "@tauri-apps/api/core";
import { HttpAccessHeadersInterface } from "../Interfaces/HttpAccessHeadersInterface";
import { LocalPass } from "../Interfaces/LocalPass";

interface HttpResponse<T = unknown> {
    status: number;
    ok: boolean;
    data?: T | null;
    error?: string;
}

interface HttpOptions extends RequestInit {
    headers?: Record<string, string>;
}

interface User {
    _id?: string;
    email?: string;
    username?: string;
    isVerified?: boolean;
    role?: string;
    fingerprint?: Fingerprint;
}

export interface UserContextType {
    user: User | undefined;
    setUser: Dispatch<SetStateAction<User | undefined>>;
    httpFetch: (endpoint: string, options?: HttpOptions) => Promise<HttpResponse>;
    inputRef: React.RefObject<HTMLInputElement | null>;
    webUrl: String;
}

const webUrl = "https://www.pvpscalpel.com"
const cfg = await invoke<HttpAccessHeadersInterface>("get_config");
const local_cfg = await invoke<LocalPass>("get_local_config")
export const UserContext = createContext<UserContextType | null>(null);

export const UserProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<User | undefined>(undefined);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const lastAuthSuccess = useRef(0);

    const httpFetch = useCallback(
        async (endpoint: string, options: HttpOptions = {}): Promise<HttpResponse> => {
            const startedAt = Date.now();
            const req = await httpFetchWithCredentials(endpoint, options);
            if (req.status === 403) {
                setUser((prev) => (startedAt < lastAuthSuccess.current ? prev : undefined));

                if (import.meta.env.DEV) {
                    console.warn("Session expired please login again (403 expected)");
                } else {
                    console.warn("Session expired please login again (403 expected)");
                }
            }

            if (endpoint === "/verify/me" && req.ok) {
                lastAuthSuccess.current = Date.now();
                setUser((prev) => prev ?? (req.data as User));
            }

            return req;
        },
        []
    );

    return (
        <UserContext.Provider value={{ user, setUser, httpFetch, inputRef, webUrl }}>
            {children}
        </UserContext.Provider>
    );
};

async function httpFetchWithCredentials<T = unknown>(
    endpoint: string,
    options: HttpOptions = {}
): Promise<HttpResponse<T>> {
    const apiDomain = import.meta.env.VITE_API_URL;
    const defaultOptions: HttpOptions = {
        credentials: "include",
        headers: {
            ...cfg,
            "Content-Type": "application/json",
            ...options.headers,
        },
    };
    
    if (import.meta.env.DEV && defaultOptions.headers) {
        const localCfgArr = (Object.entries(local_cfg))[0];
        defaultOptions.headers[localCfgArr[0]] = localCfgArr[1]
    }
    const finalOptions = { ...defaultOptions, ...options };


    try {
        const res = await fetch(apiDomain + endpoint, finalOptions);
        const contentType = res.headers.get("content-type");

        let data: T | any = null;
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
