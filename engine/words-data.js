// WORD DATABASE — Vote Out Imposter
// ---------------------------------------------------------------------------
// Format: RAW_WORDS[categoryId] = { easy: [...], normal: [...], hard: [...] }
//
// Rules enforced by engine/words.js (buildWordDatabase):
//   * A word may belong to MULTIPLE categories (one canonical entry, many tags).
//   * The same label appearing in two categories MUST carry the same difficulty,
//     otherwise the builder throws (data bug).
//   * Ids are normalized labels (NFKC → lowercase → collapsed whitespace) and
//     must be unique after normalization.
//
// Word choice guidance: simple, familiar English suitable for Indian players
// while remaining understandable internationally. Easy = highly familiar
// concrete everyday concepts. Normal = familiar but slightly more specific.
// Hard = less common yet still recognizable. No placeholders, no filler.

export const RAW_WORDS = {

  // 8.3.1 — Food and drinks -------------------------------------------------
  food: {
    easy: [
      'Idli', 'Dosa', 'Vada', 'Puri', 'Chapati', 'Roti', 'Paratha', 'Rice', 'Dal',
      'Sambar', 'Rasam', 'Biryani', 'Samosa', 'Pakoda', 'Pizza', 'Burger',
      'Sandwich', 'Noodles', 'French fries', 'Ice cream', 'Cake', 'Biscuit',
      'Chocolate', 'Apple', 'Banana', 'Mango', 'Orange', 'Grapes', 'Watermelon',
      'Potato', 'Tomato', 'Onion', 'Milk', 'Tea', 'Coffee', 'Buttermilk',
      'Lemonade', 'Coconut water', 'Curd',
    ],
    normal: [
      'Masala dosa', 'Pulao', 'Curd rice', 'Lemon rice', 'Pongal', 'Upma', 'Poha',
      'Pani puri', 'Pav bhaji', 'Chole bhature', 'Butter chicken', 'Paneer tikka',
      'Gulab jamun', 'Jalebi', 'Laddu', 'Kheer', 'Payasam', 'Pasta', 'Vada pav',
      'Filter coffee', 'Masala chai', 'Appam', 'Dahi vada', 'Rajma', 'Kulfi',
      'Modak', 'Coconut chutney',
    ],
    hard: [
      'Bisibelebath', 'Rabri', 'Shrikhand', 'Mysore pak', 'Sandesh', 'Phirni',
    ],
  },

  // 8.3.2 — People and professions -------------------------------------------
  people: {
    easy: [
      'Doctor', 'Teacher', 'Police officer', 'Farmer', 'Driver', 'Chef', 'Nurse',
      'Singer', 'Actor', 'Shopkeeper',
    ],
    normal: [
      'Engineer', 'Firefighter', 'Tailor', 'Barber', 'Electrician', 'Plumber',
      'Mechanic', 'Dentist', 'Pilot', 'Soldier', 'Scientist', 'Artist',
      'Photographer', 'Carpenter', 'Architect', 'Lawyer', 'Judge', 'Journalist',
      'Software developer', 'Delivery worker', 'Security guard', 'Cashier',
      'Chartered accountant', 'Bus conductor', 'Surgeon',
    ],
    hard: [
      'Astronomer', 'Veterinarian', 'Anthropologist',
    ],
  },

  // 8.3.3 — Family and relationships -----------------------------------------
  family: {
    easy: [
      'Mother', 'Father', 'Sister', 'Brother', 'Grandmother', 'Grandfather',
      'Uncle', 'Aunt', 'Cousin', 'Son', 'Daughter', 'Husband', 'Wife', 'Friend',
      'Best friend', 'Neighbor', 'Classmate', 'Baby', 'Twins', 'Grandparents',
      'Teacher',
    ],
    normal: [
      'Teammate', 'Relative', 'Guest', 'Roommate', 'Bride', 'Groom', 'Nephew',
      'Niece', 'Mother-in-law', 'Father-in-law',
    ],
    hard: [
      'Godparent', 'Ancestors',
    ],
  },

  // 8.3.4 — Household objects and everyday life -------------------------------
  household: {
    easy: [
      'Chair', 'Table', 'Sofa', 'Bed', 'Pillow', 'Blanket', 'Fan', 'Light bulb',
      'Clock', 'Mirror', 'Door', 'Window', 'Key', 'Lock', 'Bucket', 'Mug',
      'Bottle', 'Towel', 'Soap', 'Toothbrush', 'Toothpaste', 'Comb', 'Umbrella',
      'Pen', 'Pencil', 'Calendar', 'Dustbin', 'Candle', 'Matchbox',
    ],
    normal: [
      'Scissors', 'Tape', 'Backpack', 'Notebook', 'Wallet', 'Doormat',
      'Clothespin', 'Coat hanger', 'Mosquito net', 'Picture frame',
    ],
    hard: [
      'Paperweight', 'Bolster',
    ],
  },

  // 8.3.5 — Transport ---------------------------------------------------------
  transport: {
    easy: [
      'Bicycle', 'Motorcycle', 'Scooter', 'Car', 'Bus', 'School bus', 'Train',
      'Airplane', 'Boat', 'Ship', 'Truck', 'Tractor', 'Ambulance', 'Fire engine',
      'Taxi', 'Auto-rickshaw',
    ],
    normal: [
      'Metro train', 'Local train', 'Passenger train', 'Helicopter',
      'Electric scooter', 'Rickshaw', 'Van', 'Ferry', 'Bullock cart',
      'Cycle rickshaw', 'Jeep', 'Electric bus', 'Train engine',
    ],
    hard: [
      'Hovercraft', 'Container ship',
    ],
  },

  // 8.3.6 — School and college ------------------------------------------------
  school: {
    easy: [
      'Classroom', 'Blackboard', 'Chalk', 'Textbook', 'School bag', 'Uniform',
      'Playground', 'Student', 'Homework', 'Library', 'School bus',
    ],
    normal: [
      'Whiteboard', 'Duster', 'Exam paper', 'Report card', 'Timetable',
      'Laboratory', 'Computer lab', 'Principal', 'Lecturer', 'Professor',
      'Examination', 'Project', 'Assignment', 'Calculator', 'Ruler',
      'Certificate', 'Compass', 'School uniform', 'Microscope', 'Ink pen',
    ],
    hard: [
      'Attendance register', 'Geometry box', 'Protractor', 'Viva',
    ],
  },

  // 8.3.7 — Technology and internet --------------------------------------------
  technology: {
    easy: [
      'Smartphone', 'Laptop', 'Mouse', 'Monitor', 'Television', 'Remote control',
      'Headphones', 'Earphones', 'Charger', 'Tablet', 'Email', 'App',
      'Video call', 'QR code', 'Screenshot',
    ],
    normal: [
      'Keyboard', 'Printer', 'Scanner', 'Webcam', 'Microphone', 'Power bank',
      'USB cable', 'Wi-Fi router', 'Bluetooth speaker', 'Smartwatch',
      'Flash drive', 'Memory card', 'Browser', 'Server', 'Password', 'Download',
      'Upload', 'Website', 'Camera', 'Drone',
    ],
    hard: [
      'Motherboard', 'HDMI cable', 'Ethernet cable',
    ],
  },

  // 8.3.8 — Sports and games ---------------------------------------------------
  sports: {
    easy: [
      'Cricket', 'Football', 'Badminton', 'Volleyball', 'Basketball', 'Tennis',
      'Hockey', 'Kabaddi', 'Kho-kho', 'Chess', 'Carrom', 'Ludo', 'Running',
      'Swimming', 'Cycling', 'Hide-and-seek', 'Tag', 'Snakes and ladders',
    ],
    normal: [
      'Table tennis', 'Wrestling', 'Boxing', 'Archery', 'Bowling', 'Baseball',
      'Rugby', 'Golf', 'Skating', 'Cricket bat', 'Badminton racket',
      'Shuttlecock', 'Chessboard', 'Dice', 'Playing cards', 'Wicket',
      'Marathon',
    ],
    hard: [
      'Decathlon', 'Pole vault', 'Breaststroke',
    ],
  },

  // 8.3.9 — Places and buildings ------------------------------------------------
  places: {
    easy: [
      'Home', 'School', 'Hospital', 'Park', 'Playground', 'Temple', 'Beach',
      'City', 'Village', 'Office', 'Bank', 'Cinema', 'Zoo', 'Bus stop',
      'Restaurant', 'Hotel', 'Library',
    ],
    normal: [
      'Apartment', 'College', 'Clinic', 'Pharmacy', 'Supermarket',
      'Grocery store', 'Shopping mall', 'Railway station', 'Airport',
      'Metro station', 'Museum', 'Stadium', 'Mosque', 'Church', 'Factory',
      'Police station', 'Fire station', 'Post office', 'Petrol station',
      'Railway platform',
    ],
    hard: [
      'Water treatment plant', 'Town hall', 'Monastery',
    ],
  },

  // 8.3.10 — Entertainment and media ---------------------------------------------
  entertainment: {
    easy: [
      'Movie', 'Cartoon', 'Newspaper', 'Radio', 'Song', 'Magic show',
      'Remote control', 'Headphones',
    ],
    normal: [
      'Television show', 'Comic book', 'Magazine', 'Podcast', 'Video game',
      'Documentary', 'Web series', 'Short film', 'Music video', 'Advertisement',
      'Theatre', 'Stage show', 'Puppet show', 'Streaming service',
      'Movie ticket', 'Film camera', 'Microphone', 'Projector', 'Speaker',
      'Talk show', 'Reality show', 'Talent show', 'Award ceremony', 'Camera',
    ],
    hard: [
      'Sitcom',
    ],
  },

  // 8.3.11 — Animals and birds ----------------------------------------------------
  animals: {
    easy: [
      'Dog', 'Cat', 'Cow', 'Buffalo', 'Goat', 'Horse', 'Donkey', 'Camel',
      'Elephant', 'Tiger', 'Lion', 'Monkey', 'Rabbit', 'Mouse', 'Bear', 'Pig',
      'Chicken', 'Duck', 'Pigeon', 'Crow', 'Sparrow', 'Parrot', 'Peacock',
      'Owl', 'Fish', 'Snake', 'Frog', 'Butterfly', 'Ant', 'Spider',
    ],
    normal: [
      'Sheep', 'Leopard', 'Deer', 'Squirrel', 'Rat', 'Fox', 'Wolf', 'Rooster',
      'Goose', 'Eagle', 'Kingfisher', 'Penguin', 'Flamingo', 'Dolphin', 'Whale',
      'Turtle', 'Honeybee', 'Zebra', 'Giraffe', 'Kangaroo', 'Crocodile',
      'Mongoose', 'Woodpecker', 'Hippopotamus',
    ],
    hard: [
      'Porcupine', 'Sloth bear',
    ],
  },

  // 8.3.12 — Nature and weather -----------------------------------------------------
  nature: {
    easy: [
      'Sun', 'Moon', 'Star', 'Cloud', 'Rain', 'Rainbow', 'Wind', 'River', 'Lake',
      'Sea', 'Ocean', 'Tree', 'Flower', 'Grass', 'Leaf', 'Sand', 'Rock',
      'Sunrise', 'Sunset', 'Shadow', 'Mountain',
    ],
    normal: [
      'Thunder', 'Lightning', 'Storm', 'Snow', 'Pond', 'Waterfall', 'Hill',
      'Valley', 'Forest', 'Root', 'Seed', 'Soil', 'Desert', 'Island', 'Fog',
      'Mist', 'Volcano', 'Earthquake', 'Flood', 'Drought', 'Eclipse',
      'Banyan tree',
    ],
    hard: [
      'Glacier', 'Avalanche', 'Cyclone',
    ],
  },

  // 8.3.13 — India and Indian daily life ----------------------------------------------
  india: {
    easy: [
      'Aadhaar card', 'Rupee', 'UPI payment', 'Auto-rickshaw', 'Traffic signal',
      'Pressure cooker',
      'Tiffin box', 'Steel plate', 'Rangoli', 'Cricket match', 'Chai stall',
      'Vegetable market', 'Bus pass', 'Lunch box', 'Water bottle', 'Power cut',
      'Monsoon', 'Street food', 'Indian flag',
    ],
    normal: [
      'Indian Railways', 'Metro card', 'Street vendor',
      'Water tanker', 'Kolam', 'Coconut seller', 'Kirana shop',
      'School uniform', 'Wedding invitation', 'Indian passport',
      'Railway ticket', 'Local market', 'Postbox', 'Colony',
      'Festival procession', 'Ration card',
    ],
    hard: [
      'Apartment association', 'Autorickshaw meter',
    ],
  },

  // 8.3.14 — Festivals and occasions -----------------------------------------------------
  festivals: {
    easy: [
      'Birthday', 'Wedding', 'Picnic', 'New Year', 'Celebration', 'Diwali',
      'Holi', 'Eid', 'Christmas', 'Independence Day', 'Republic Day',
    ],
    normal: [
      'Anniversary', 'Graduation', 'Sankranti', 'Pongal', 'Ugadi', 'Onam',
      'Dussehra', 'Navratri', 'Ganesh Chaturthi', 'Raksha Bandhan',
      'Housewarming', 'Farewell', 'Reunion', 'School annual day', 'Sports day',
      'Family gathering', 'Gift exchange', 'Engagement', 'Baby shower',
      'Naming ceremony',
    ],
    hard: [
      'Baisakhi', 'Gudi Padwa',
    ],
  },

  // 8.3.15 — Clothing and accessories ------------------------------------------------------
  clothing: {
    easy: [
      'Shirt', 'T-shirt', 'Jeans', 'Shorts', 'Skirt', 'Dress', 'Saree', 'Kurta',
      'Shoes', 'Sandals', 'Slippers', 'Socks', 'Cap', 'Belt', 'Watch',
      'Sunglasses', 'Raincoat',
    ],
    normal: [
      'Trousers', 'Salwar kameez', 'School uniform', 'Jacket', 'Sweater',
      'Ring', 'Bracelet', 'Necklace', 'Earrings', 'Backpack', 'Handbag',
      'Wallet', 'Scarf', 'Tie', 'Helmet', 'Gloves', 'Dupatta', 'Nehru jacket',
    ],
    hard: [
      'Mojari', 'Sherwani',
    ],
  },

  // 8.3.16 — Healthcare objects -------------------------------------------------------------
  healthcare: {
    easy: [
      'Bandage', 'Cotton', 'Face mask', 'Hand sanitizer', 'Spectacles',
      'Medicine',
    ],
    normal: [
      'Thermometer', 'First-aid box', 'Stethoscope', 'Syringe', 'Ice pack',
      'Hot-water bag', 'Wheelchair', 'Blood-pressure monitor', 'Weighing scale',
      'Medicine bottle', 'Pill organizer', 'Contact lens', 'Inhaler',
      'Digital thermometer', 'Gauze', 'Adhesive plaster', 'Walking stick',
      'Medical gloves', 'Cough syrup', 'Prescription', 'Ointment', 'Antacid',
      'Vitamin tablets', 'Eyedrops',
    ],
    hard: [
      'Hearing aid', 'Crutches',
    ],
  },

  // 8.3.17 — Shopping and money ----------------------------------------------------------------
  shopping: {
    easy: [
      'Coin', 'Banknote', 'Purse', 'ATM', 'Money', 'Piggy bank',
      'Pocket money',
    ],
    normal: [
      'Wallet', 'Debit card', 'Credit card', 'UPI QR code', 'Shopping cart',
      'Shopping basket', 'Receipt', 'Bill', 'Barcode', 'Price tag',
      'Discount coupon', 'Gift card', 'Cash counter', 'Cash register',
      'Savings account', 'Bank passbook', 'Online order', 'Delivery parcel',
      'Shopping bag', 'Refund', 'Change', 'Discount', 'Loyalty card', 'EMI',
    ],
    hard: [
      'Invoice',
    ],
  },

  // 8.3.18 — Household chores --------------------------------------------------------------------
  chores: {
    easy: [
      'Sweeping', 'Dusting', 'Cooking', 'Washing dishes', 'Making the bed',
      'Watering plants', 'Setting the table', 'Feeding a pet',
      'Washing clothes',
    ],
    normal: [
      'Mopping', 'Folding clothes', 'Ironing', 'Cleaning windows',
      'Taking out rubbish', 'Organizing books', 'Cleaning the bathroom',
      'Washing the car', 'Grocery shopping', 'Vacuuming', 'Hanging clothes',
      'Cleaning fans', 'Arranging cupboards', 'Washing vegetables',
      'Changing bedsheets', 'Polishing shoes', 'Sorting laundry',
      'Hanging curtains', 'Cleaning the fridge', 'Organizing the desk',
      'Drying clothes', 'Making tea',
    ],
    hard: [
      'Unclogging a drain',
    ],
  },

  // 8.3.19 — Hobbies -------------------------------------------------------------------------------
  hobbies: {
    easy: [
      'Reading', 'Drawing', 'Singing', 'Dancing', 'Cooking', 'Cycling',
      'Swimming', 'Yoga', 'Gardening',
    ],
    normal: [
      'Painting', 'Photography', 'Baking', 'Travelling', 'Collecting stamps',
      'Collecting coins', 'Building models', 'Coding', 'Blogging',
      'Writing stories', 'Playing chess', 'Playing cricket', 'Birdwatching',
      'Fishing', 'Knitting', 'Origami', 'Solving puzzles', 'Board games',
      'DIY crafts', 'Listening to music', 'Pottery', 'Meditation', 'Trekking',
    ],
    hard: [
      'Calligraphy', 'Astronomy', 'Aeromodelling', 'Embroidery',
    ],
  },

  // 8.3.20 — Musical instruments ---------------------------------------------------------------------
  instruments: {
    easy: [
      'Guitar', 'Piano', 'Flute', 'Drums', 'Tabla', 'Harmonium',
    ],
    normal: [
      'Keyboard', 'Violin', 'Recorder', 'Dholak', 'Dhol', 'Sitar', 'Veena',
      'Trumpet', 'Saxophone', 'Clarinet', 'Trombone', 'Harp', 'Ukulele',
      'Mandolin', 'Tambourine', 'Cymbals', 'Xylophone', 'Mouth organ',
      'Shehnai', 'Nadaswaram', 'Bass guitar', 'Bongo drums',
    ],
    hard: [
      'Viola', 'Cello', 'Mridangam', 'Tanpura', 'Banjo',
    ],
  },

  // 8.3.21 — Tools --------------------------------------------------------------------------------------
  tools: {
    easy: [
      'Hammer', 'Axe', 'Ladder', 'Shovel',
    ],
    normal: [
      'Screwdriver', 'Spanner', 'Wrench', 'Pliers', 'Drill', 'Saw',
      'Measuring tape', 'Allen key', 'Wire cutter', 'Utility knife', 'Spade',
      'Paintbrush', 'Paint roller', 'Toolbox', 'Stapler', 'Glue gun',
      'Crowbar', 'Sandpaper', 'Nut and bolt', 'Compass',
    ],
    hard: [
      'Chisel', 'File', 'Clamp', 'Trowel', 'Spirit level', 'Soldering iron',
      'Wire stripper',
    ],
  },

  // 8.3.22 — Kitchen appliances ---------------------------------------------------------------------------
  kitchen: {
    easy: [
      'Refrigerator', 'Gas stove', 'Microwave oven', 'Pressure cooker',
    ],
    normal: [
      'Mixer grinder', 'Blender', 'Electric kettle', 'Rice cooker',
      'Induction cooktop', 'Toaster', 'Sandwich maker', 'Air fryer',
      'Dishwasher', 'Water purifier', 'Water dispenser', 'Juicer',
      'Coffee maker', 'Hand mixer', 'Kitchen scale', 'Electric oven',
      'Exhaust fan', 'Chimney', 'Food processor', 'Electric rice cooker',
      'Rolling pin', 'Ladle', 'Grater', 'Mortar and pestle', 'Tawa',
      'Colander',
    ],
    hard: [],
  },

  // 8.3.23 — Colours and shapes ----------------------------------------------------------------------------
  colours: {
    easy: [
      'Red', 'Blue', 'Green', 'Yellow', 'Orange', 'Pink', 'Black', 'White',
      'Brown', 'Circle', 'Square', 'Triangle', 'Star', 'Heart', 'Arrow',
    ],
    normal: [
      'Purple', 'Grey', 'Gold', 'Silver', 'Rectangle', 'Oval', 'Diamond',
      'Cube', 'Sphere', 'Cylinder', 'Cone', 'Crescent', 'Spiral', 'Maroon',
    ],
    hard: [
      'Pentagon', 'Hexagon', 'Rhombus', 'Octagon', 'Turquoise',
    ],
  },

  // 8.3.24 — Travel -------------------------------------------------------------------------------------------
  travel: {
    easy: [
      'Suitcase', 'Map', 'Water bottle', 'Sunglasses', 'Picnic', 'Flight',
    ],
    normal: [
      'Passport', 'Boarding pass', 'Train ticket', 'Tourist guide',
      'Hotel room', 'Reservation', 'Travel pillow', 'Luggage tag', 'Backpack',
      'Travel adapter', 'Camera', 'Road trip', 'Bus journey', 'Train journey',
      'Airport security', 'Railway platform', 'Tourist attraction', 'Souvenir',
      'Travel insurance', 'Currency exchange', 'Camping tent', 'Sleeping bag',
      'Jungle safari', 'Hill station', 'Compass',
    ],
    hard: [
      'Itinerary', 'Layover',
    ],
  },

  // 8.3.25 — Toys -----------------------------------------------------------------------------------------------
  toys: {
    easy: [
      'Teddy bear', 'Toy car', 'Doll', 'Building blocks', 'Ball', 'Kite',
      'Balloon', 'Jump rope', 'Skateboard', 'Rubber duck',
    ],
    normal: [
      'Puzzle', 'Yo-yo', 'Toy train', 'Remote-control car', 'Toy robot',
      'Spinning top', 'Toy dinosaur', 'Water gun', 'Toy kitchen',
      'Stuffed animal', 'Marbles', 'Bubble wand', 'Toy airplane', 'Puppet',
      'Board game', 'Toy drum', 'Rocking horse', 'Hula hoop', 'Toy phone',
      'Modelling clay', 'Slingshot',
    ],
    hard: [
      'Jack-in-the-box', 'Kaleidoscope',
    ],
  },

  // 8.3.26 — Basic emotions ---------------------------------------------------------------------------------------
  emotions: {
    easy: [
      'Happiness', 'Sadness', 'Anger', 'Fear', 'Surprise', 'Love', 'Joy',
      'Boredom', 'Shyness', 'Worry',
    ],
    normal: [
      'Excitement', 'Nervousness', 'Confusion', 'Pride', 'Relief', 'Curiosity',
      'Jealousy', 'Embarrassment', 'Disappointment', 'Hope', 'Calmness',
      'Frustration', 'Gratitude', 'Loneliness', 'Confidence', 'Trust',
      'Sympathy', 'Patience', 'Panic', 'Amazement', 'Empathy', 'Grief',
    ],
    hard: [
      'Nostalgia', 'Melancholy', 'Remorse',
    ],
  },

  // 8.3.27 — Special (technology concepts + artificial intelligence) -----------------------------------------------
  special: {
    easy: [
      'Virtual Reality',
    ],
    normal: [
      'VR Developments', 'Hardware', 'Software', 'Network', 'Server',
      'Operating System', 'Application', 'Browser', 'Router', 'IP Address',
      'Storage', 'Artificial Intelligence', 'Generative AI',
      'Prompt Engineering', 'Automation', 'Chatbot', 'Computer Code',
      'Robotics', 'Predictive Text',
    ],
    hard: [
      'Algorithm', 'Database', 'Cloud Computing', 'Encryption', 'Bandwidth',
      'Processor', 'Microchip', 'Firewall', 'Firmware', 'Cyber Security',
      'Machine Learning', 'Deep Learning', 'Neural Network',
      'Natural Language Processing', 'Computer Vision', 'Large Language Model',
      'Training Data', 'Data Bias', 'Hallucination', 'Supervised Learning',
      'Unsupervised Learning', 'Algorithm Model',
    ],
  },

  // 8.3.28 — Famous characters and recognizable public figures ------------------------------------------------------
  // Treated as names only — no impersonation, no endorsement, no claims.
  famous: {
    easy: [
      'Harry Potter', 'Spider-Man', 'Batman', 'Superman', 'Mickey Mouse',
      'Doraemon', 'Chhota Bheem', 'Cinderella', 'Mario', 'Pikachu',
      'Virat Kohli', 'Sachin Tendulkar', 'Albert Einstein', 'Iron Man',
    ],
    normal: [
      'Sherlock Holmes', 'Donald Duck', 'Tenali Raman', 'Birbal', 'Mowgli',
      'Winnie-the-Pooh', 'Snow White', 'Sonic', 'A. P. J. Abdul Kalam',
      'M. S. Dhoni', 'P. V. Sindhu', 'Neeraj Chopra', 'Mary Kom',
      'Sunita Williams', 'Kalpana Chawla', 'Marie Curie', 'Leonardo da Vinci',
      'C. V. Raman', 'Srinivasa Ramanujan', 'Rakshith Volam', 'Vijay',
      'Nishanth Payyavula', 'Sunil', 'Ritesh', 'Bunny', 'Akbar',
      'Chacha Chaudhary',
    ],
    hard: [
      'R. K. Narayan',
    ],
  },
};
