const express = require('express');
const axios = require('axios');
const parser = require('xml2json');
const cors = require('cors')
const multer = require('multer');

const app = express ();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

const PORT = process.env.PORT || 3001;
const instances = {}


app.listen(PORT, () => {
    console.log("Server Listening on PORT:", PORT);
});

app.post("/",multer().none(), (request, response) => {
    var event = request.body.topic+"/"+request.body.event;
    var notification = JSON.parse(request.body.notification);
    console.log("Event: "+event)
    console.log("Instance: "+notification.instance)
    console.log("Content: "+JSON.stringify(notification.content))
    if (event == "activity/calling") {
        if (!(notification.instance in instances)) {
            instances[notification.instance] = {}
        }
        if (!(notification.content.activity in instances[notification.instance])) {
            instances[notification.instance][notification.content.activity] = {"status":"calling"}
        }
    }else if (event == "activity/status") {
        if (notification.instance in instances && notification.content.activity in instances[notification.instance]) {
            if (instances[notification.instance][notification.content.activity].status == "calling") {
                instances[notification.instance][notification.content.activity].status = "status"
            }else{
                instances[notification.instance][notification.content.activity].status = "error"
            }
        }
    }else if (event == "activity/done") {
        if (notification.instance in instances && notification.content.activity in instances[notification.instance]) {
            if (instances[notification.instance][notification.content.activity].status == "status") {
                delete instances[notification.instance][notification.content.activity]
                if (instances[notification.instance].size == 0) {
                    delete instances[notification.instance]
                }
            }else{
                instances[notification.instance][notification.content.activity].status = "error"
            }
        }
    }
});

app.get("/instances", (request, response) => {
    response.send(instances);
})



