export const privyConfig = {
  appId: process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
  loginMethods: ["email", "wallet"],
  appearance: {
    theme: "dark",
    accentColor: "#3B82F6", // blue-500
    showWalletLoginFirst: false,
  },
}; 