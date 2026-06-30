"use client";

import { useRouter } from "next/navigation";

export default function AuthenticatedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="mx-auto max-w-md rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
        <h2 className="mb-2 text-xl font-semibold text-gray-900">Something went wrong</h2>
        <p className="mb-6 text-sm text-gray-500">
          An error occurred. Please try again or go back to the dashboard.
        </p>
        <div className="flex justify-center gap-3">
          <button
            onClick={reset}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Try again
          </button>
          <button
            onClick={() => router.push("/")}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
