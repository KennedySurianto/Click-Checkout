var i = 0;
var txtIndex = 0;
var speed = 50;
var delay = 2000; // Delay after finishing typing and before backspacing
var backspaceSpeed = 30;
var texts = [
    'Discover amazing deals on our eCommerce site.',
    'Shop the latest trends at unbeatable prices.',
    'Free shipping on orders over $50!',
    'Sign up for exclusive offers and discounts.',
    'Your one-stop shop for all your needs.',
    'New arrivals daily! Don’t miss out.',
    'Hassle-free returns within 30 days.',
    'Join our loyalty program and save more.'
];

function typeWriter() {
    if (i < texts[txtIndex].length) {
        document.getElementById("demo").innerHTML += texts[txtIndex].charAt(i);
        i++;
        setTimeout(typeWriter, speed);
    } else {
        setTimeout(backspace, delay);
    }
}

function backspace() {
    if (i > 0) {
        document.getElementById("demo").innerHTML = document.getElementById("demo").innerHTML.slice(0, -1);
        i--;
        setTimeout(backspace, backspaceSpeed);
    } else {
        txtIndex = (txtIndex + 1) % texts.length;
        setTimeout(typeWriter, delay);
    }
}

function startTypewriter() {
    i = 0;
    txtIndex = 0;
    document.getElementById("demo").innerHTML = "";
    typeWriter();
}