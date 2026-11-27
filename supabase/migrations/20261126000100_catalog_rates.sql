insert into public.rooms(room_number,room_type,price_per_night,is_active) values
('ZDT-GINGER-MUMBAI-AIRPORT','Ginger Mumbai Airport · Luxe Twin Room',4900,false),
('ZDT-BLOOMROOMS-JANPATH','bloomrooms @ Janpath · Standard Twin',5200,false),
('ZDT-EROS-HOTEL-NEW-DELHI-NEHRU-PLACE','Eros Hotel New Delhi Nehru Place · 2 Twin Classic',8500,false)
on conflict (room_number) do nothing;
