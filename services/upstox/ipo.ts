import { getUpstoxClient } from "@/clients/upstoxClient";
import type {
  UpstoxIpoDetailsResponse,
  UpstoxIposListResponse,
} from "@/services/upstox/types";
import { upstoxSdk, withUpstoxTransport } from "@/services/upstox/upstoxSdk";
import {
  assertNonEmptyString,
  upstoxInputError,
} from "@/services/upstox/validation";

export type IpoStatus = "open" | "closed" | "listed" | "upcoming";
export type IpoIssueType = "regular" | "sme";

export type GetIposParams = {
  status?: IpoStatus;
  issueType?: IpoIssueType;
  pageNumber?: number;
  records?: number;
};

const IPO_STATUSES: IpoStatus[] = ["open", "closed", "listed", "upcoming"];
const IPO_ISSUE_TYPES: IpoIssueType[] = ["regular", "sme"];

async function getIposHttp(
  params: GetIposParams,
): Promise<UpstoxIposListResponse> {
  const client = getUpstoxClient();
  return client.get<UpstoxIposListResponse>("/v2/ipos", {
    query: {
      ...(params.status ? { status: params.status } : {}),
      ...(params.issueType ? { issue_type: params.issueType } : {}),
      ...(params.pageNumber != null ? { page_number: params.pageNumber } : {}),
      ...(params.records != null ? { records: params.records } : {}),
    },
  });
}

/**
 * `GET /v2/ipos`
 * @see https://upstox.com/developer/api-documentation/get-ipos/
 */
export async function getIpos(
  params: GetIposParams = {},
): Promise<UpstoxIposListResponse> {
  if (params.status && !IPO_STATUSES.includes(params.status)) {
    throw upstoxInputError(
      `status must be one of: ${IPO_STATUSES.join(", ")}.`,
    );
  }
  if (params.issueType && !IPO_ISSUE_TYPES.includes(params.issueType)) {
    throw upstoxInputError(
      `issue_type must be one of: ${IPO_ISSUE_TYPES.join(", ")}.`,
    );
  }
  if (params.pageNumber != null && params.pageNumber < 1) {
    throw upstoxInputError("page_number must be at least 1.");
  }
  if (
    params.records != null &&
    (!Number.isInteger(params.records) ||
      params.records < 1 ||
      params.records > 30)
  ) {
    throw upstoxInputError("records must be between 1 and 30.");
  }

  return withUpstoxTransport({
    sdk: () =>
      upstoxSdk.ipo.getIpoListing({
        status: params.status,
        issueType: params.issueType,
        pageNumber: params.pageNumber,
        records: params.records,
      }),
    http: () => getIposHttp(params),
  });
}

async function getIpoDetailsHttp(
  ipoId: string,
): Promise<UpstoxIpoDetailsResponse> {
  const client = getUpstoxClient();
  return client.get<UpstoxIpoDetailsResponse>(
    `/v2/ipos/${encodeURIComponent(ipoId.trim())}`,
  );
}

/**
 * `GET /v2/ipos/{id}`
 * @see https://upstox.com/developer/api-documentation/get-ipo-details/
 */
export async function getIpoDetails(
  ipoId: string,
): Promise<UpstoxIpoDetailsResponse> {
  assertNonEmptyString(ipoId, "id");

  return withUpstoxTransport({
    sdk: () => upstoxSdk.ipo.getIpoDetails(ipoId.trim()),
    http: () => getIpoDetailsHttp(ipoId),
  });
}
