import { useEffect, useState, type ReactElement } from "react";
import { type ErrorResponse, isRouteErrorResponse, useParams, useRouteError } from "react-router";
import { tryRecoverFromManifestMismatch } from "#app/utils/manifest-mismatch.ts";
import { getErrorMessage } from "#app/utils/misc";

export type StatusHandler = (info: {
  error: ErrorResponse;
  params: Record<string, string | undefined>;
}) => ReactElement | null;

const defaultStatusHandler: StatusHandler = ({ error }) => (
  <p>
    {error.status} {error.data}
  </p>
);

const unexpectedErrorHandler = (error: unknown) => <p>{getErrorMessage(error)}</p>;

export function GeneralErrorBoundary({
  defaultStatusHandler: defaultStatusHandlerProp = defaultStatusHandler,
  statusHandlers,
  unexpectedErrorHandler: unexpectedErrorHandlerProp = unexpectedErrorHandler,
}: {
  defaultStatusHandler?: StatusHandler;
  statusHandlers?: Record<number, StatusHandler>;
  unexpectedErrorHandler?: (error: unknown) => ReactElement | null;
}) {
  const error = useRouteError();
  const params = useParams();
  const isResponse = isRouteErrorResponse(error);
  const [recoveringManifest, setRecoveringManifest] = useState(false);

  if (typeof document !== "undefined") {
    console.error(error);
  }

  useEffect(() => {
    if (isResponse) return;

    if (tryRecoverFromManifestMismatch(error)) {
      setRecoveringManifest(true);
      return;
    }

    // Sentry client-side error capture — gated on ENV.MODE + ENV.SENTRY_DSN at runtime
    if (ENV.MODE === "production" && ENV.SENTRY_DSN) {
      void import("@sentry/react-router").then((Sentry) => Sentry.captureException(error));
    }
  }, [error, isResponse]);

  if (recoveringManifest) {
    return (
      <div className="text-h2 container flex items-center justify-center p-20">
        <p>Updating the app… reloading.</p>
      </div>
    );
  }

  return (
    <div className="text-h2 container flex items-center justify-center p-20">
      {isResponse
        ? (statusHandlers?.[error.status] ?? defaultStatusHandlerProp)({
            error,
            params,
          })
        : unexpectedErrorHandlerProp(error)}
    </div>
  );
}
