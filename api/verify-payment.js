const crypto=require('crypto');
const Razorpay=require('razorpay');
module.exports=async(req,res)=>{
 if(req.method!=='POST')return res.status(405).json({verified:false,error:'Method not allowed'});
 try{
  const {razorpay_order_id:orderId,razorpay_payment_id:paymentId,razorpay_signature:signature}=req.body||{};
  if(typeof orderId!=='string'||typeof paymentId!=='string'||typeof signature!=='string'||!orderId||!paymentId||!/^[a-f0-9]{64}$/i.test(signature))return res.status(400).json({verified:false,error:'Invalid payment details'});
  const keyId=process.env.RAZORPAY_KEY_ID,keySecret=process.env.RAZORPAY_KEY_SECRET;
  if(!keyId||!keySecret)return res.status(500).json({verified:false,error:'Payment configuration missing'});
  const expected=crypto.createHmac('sha256',keySecret).update(`${orderId}|${paymentId}`).digest();
  const received=Buffer.from(signature,'hex');
  if(expected.length!==received.length||!crypto.timingSafeEqual(expected,received))return res.status(400).json({verified:false,error:'Invalid payment signature'});
  const razorpay=new Razorpay({key_id:keyId,key_secret:keySecret});
  const [payment,order]=await Promise.all([razorpay.payments.fetch(paymentId),razorpay.orders.fetch(orderId)]);
  if(payment.order_id!==orderId||payment.status!=='captured'||payment.currency!=='INR'||payment.amount!==100||order.amount!==100||order.currency!=='INR'||order.status!=='paid')return res.status(400).json({verified:false,error:'Payment is not fully captured'});
  return res.status(200).json({verified:true,orderId,paymentId,amount:payment.amount,currency:payment.currency});
 }catch(error){console.error('Payment verification failed',error);return res.status(500).json({verified:false,error:'Unable to verify payment'});}
};
