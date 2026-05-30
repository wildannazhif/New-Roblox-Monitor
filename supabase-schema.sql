-- Create orders table
CREATE TABLE public.orders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    "orderId" TEXT NOT NULL,
    "orderDate" TEXT,
    "parsedDate" TIMESTAMP WITH TIME ZONE,
    "localDate" TIMESTAMP WITH TIME ZONE,
    "title" TEXT,
    "offerType" TEXT,
    "description" TEXT,
    "purchaseQuantity" INTEGER,
    "orderState" TEXT,
    "disputeReason" TEXT,
    "disputeMessage" TEXT,
    "pricePerUnitAmount" NUMERIC,
    "pricePerUnitCurrency" TEXT,
    "feedbackRating" TEXT,
    "reviewMessage" TEXT,
    "cancelationReason" TEXT,
    "cancelationMessage" TEXT,
    "totalOrderAmount" NUMERIC,
    "totalPriceCurrency" TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, "orderId")
);

-- Enable RLS
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Create policy to allow users to only see and insert their own data
CREATE POLICY "Users can manage their own orders" 
ON public.orders 
FOR ALL 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);
