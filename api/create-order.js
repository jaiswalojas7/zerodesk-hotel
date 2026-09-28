const Razorpay=require('razorpay');
module.exports=async(req,res)=>{
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 try{
  const keyId=process.env.RAZORPAY_KEY_ID,keySecret=process.env.RAZORPAY_KEY_SECRET;
  if(!keyId||!keySecret)return res.status(500).json({error:'Payment configuration missing'});
  const razorpay=new Razorpay({key_id:keyId,key_secret:keySecret});
  const order=await razorpay.orders.create({amount:100,currency:'INR',receipt:`zd_${Date.now()}`});
  return res.status(200).json({orderId:order.id,amount:order.amount,currency:order.currency,keyId});
 }catch(error){console.error('Order creation failed',error);return res.status(500).json({error:'Unable to create payment order'});}
};
