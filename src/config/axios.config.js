import axios from 'axios';

const baseURL=process.env.SHIPROCKET_API_URL

const instance=axios.create({
    baseURL,
    timeout: 15000,
});

export default instance;