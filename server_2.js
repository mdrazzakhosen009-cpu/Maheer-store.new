const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// পূর্বের প্রোডাক্ট বা অন্যান্য ডাটা ঠিক রেখে কাস্টমার রিভিউ ডাটা যোগ করা হলো
let customerReviews = [
    { id: 1, name: 'Customer Review', image: 'review-1.jpg' }
];

// API: রিভিউ ফেচ করার জন্য
app.get('/api/reviews', (req, res) => {
    res.json(customerReviews);
});

// API: অ্যাডমিন প্যানেল থেকে নতুন রিভিউ পিক আপলোড করার জন্য
app.post('/api/reviews', (req, res) => {
    const { name, image } = req.body;
    const newReview = {
        id: customerReviews.length > 0 ? customerReviews[customerReviews.length - 1].id + 1 : 1,
        name: name || 'Valued Customer',
        image: image || 'review-default.jpg'
    };
    customerReviews.push(newReview);
    res.json({ success: true, review: newReview });
});

// আপনার পূর্বের অন্যান্য রাউট বা সিস্টেম এখানে অপরিবর্তিত থাকবে
