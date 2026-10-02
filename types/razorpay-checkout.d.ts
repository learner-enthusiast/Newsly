interface RazorpayPrefill {
  name?: string;
  email?: string;
  contact?: string;
}

interface RazorpayHandlerResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface RazorpayCheckoutOptions {
  key: string;
  amount: number;
  currency: string;
  name?: string;
  description?: string;
  order_id: string;
  prefill?: RazorpayPrefill;
  theme?: { color?: string };
  handler: (response: RazorpayHandlerResponse) => void;
  modal?: {
    ondismiss?: () => void;
  };
}

declare class Razorpay {
  constructor(options: RazorpayCheckoutOptions);
  open: () => void;
  on: (
    event: string,
    handler: (response: { error?: { description?: string } }) => void,
  ) => void;
}

interface Window {
  Razorpay: typeof Razorpay;
}
