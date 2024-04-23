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
const concernsSaved = {}
const dict = {}

app.listen(PORT, () => {
    console.log("Server Listening on PORT:", PORT);
});

app.post("/",multer().none(), (request, response) => {
    var event = request.body.topic+"/"+request.body.event;
    var notification = JSON.parse(request.body.notification);
    var instance = notification.instance;
    var cpee_instance_url = notification["instance-url"];
    var activity = notification.content.activity;
    //console.log("Event: "+event)
    //console.log("Instance: "+notification.instance)
    //console.log("Content: "+JSON.stringify(notification.content))
    switch (event) {
        case "activity/calling":
            if (!(instance in instances)) {
                instances[instance] = {}
            }
            if (!(activity in instances[instance])) {
                instances[instance][activity] = {"status":"calling"}
                instances[instance][activity].concerns = JSON.parse(('[' + notification.content.parameters.arguments[0].value.slice(2,-2) + ']').replace(new RegExp('"concern": ', 'g'), ''));;
            }
            break;
        case "activity/status":
            if (instance in instances && activity in instances[instance]) {
                if (instances[instance][activity].status == "calling>receiving") {
                    filterSubjects(cpee_instance_url, instances[instance][activity].concerns).then(subject => {
                        dict[subject.uid] = {}
                        dict[subject.uid]["callback"] = request.headers['cpee-callback']
                        dict[subject.uid]["label"] = request.headers['cpee-label']
                        dict[subject.uid]["activity"] = request.headers['cpee-activity']
                        dict[subject.uid]["instance"] = request.headers['cpee-instance']
                        if  (subject.uid == notification.content.status.slice(22)){
                            instances[instance][activity].status = "status"
                            instances[instance][activity].user = subject.uid
                            console.log('Status: "'+notification.content.status+'"')
                        }else {
                            instances[instance][activity].status = "error"
                        }
                    });
                }else{
                    instances[instance][activity].status = "error"
                }
            }
            break;
        case "activity/receiving":
            if (instance in instances && activity in instances[instance]) {
                if (instances[instance][activity].status == "calling") {
                    instances[instance][activity].status = "calling>receiving"
                } else if (instances[instance][activity].status == "status") {
                    var data = JSON.parse(notification.content.received[0].data)
                    if (instances[instance][activity].user == data.user) {
                        instances[instance][activity].status = "status>receiving"
                        console.log("Receiving: "+JSON.stringify(data))
                        if (data.user in dict) {
                            delete dict[data.user]
                        }
                    }else {
                        instances[instance][activity].status = "error"
                    }
                }else{
                    instances[instance][activity].status = "error"
                }
            }
            break;
        case "activity/done":
            if (instance in instances && activity in instances[instance]) {
                if (instances[instance][activity].status == "status>receiving") {
                    delete instances[instance][activity]
                    if (Object.keys(instances[instance]).length == 0) {
                        delete instances[instance]
                    }
                }else{
                    instances[instance][activity].status = "error"
                }
            }
            break;
        default:
            console.log("Unknown error occurred!")
    }
});

app.get("/instances", (request, response) => {
    response.send(instances);
})

function filterSubjects(cpee_instance_url, concerns) {
    
    let foundSubjects = []
    let found = false

    let subject = axios.get(cpee_instance_url + '/properties/description').then(async resp => {
        let concernData = (JSON.parse(parser.toJson(resp.data))).description._concerns.concern;
        for (const concern of concerns) {
            for (const c of concernData) {
                if (concern.id == c.id) {
                    try {
                        const org = await axios.get(c.orgmodel)

                        if (cpee_instance_url in concernsSaved && concern.id in concernsSaved[cpee_instance_url]) {
                            if(c.type == "BOD") {
                                if (!found && (foundSubjects.length == 0 || foundSubjects.find(toFind => toFind.uid == concernsSaved[cpee_instance_url][concern.id]))) {
                                    foundSubjects = [concernsSaved[cpee_instance_url][concern.id]]
                                } else {
                                    foundSubjects = []
                                    found = true
                                }
                            }else if (c.type == "SOD"){
                                if (!found && foundSubjects.length == 0) {
                                    foundSubjects = JSON.parse(parser.toJson(org.data)).organisation.subjects.subject.filter(toFilter => toFilter.uid != concernsSaved[cpee_instance_url][concern.id].uid)
                                }else{
                                    foundSubjects = foundSubjects.filter(toFilter => toFilter.uid != concernsSaved[cpee_instance_url][concern.id])
                                }
                                if (foundSubjects.length == 0) {
                                    found = true
                                }
                            }
                        }

                        if (!found) {
                            if (foundSubjects.length > 0) {
                                let subjects = foundSubjects.filter(toFilter => {
                                    if (Array.isArray(toFilter.relation)){
                                        return toFilter.relation.find(toFind => toFind.role == c.role);
                                    }else{
                                        return toFilter.relation.role == c.role;
                                    }
                                });
    
                                foundSubjects = subjects;
                            }else {
                                let subjects = JSON.parse(parser.toJson(org.data)).organisation.subjects.subject.filter(toFilter => {
                                    if (Array.isArray(toFilter.relation)){
                                        return toFilter.relation.find(toFind => toFind.role == c.role);
                                    }else{
                                        return toFilter.relation.role == c.role;
                                    }
                                });
    
                                foundSubjects = subjects;

                            }
                            if (foundSubjects.len == 0) {
                                found = true;
                            }
                        }
                    } catch (error) {
                        console.log(error);
                    }
                }
            }
        }
        
        if (foundSubjects.length > 0 ){
            for (const subject of foundSubjects) {
                if (!(subject.uid in dict)) {
                    for (const concern of concerns) {
                        if (!(cpee_instance_url in concernsSaved)) {
                            concernsSaved[cpee_instance_url] = {}
                        }
                        if (!(concern.id in concernsSaved[cpee_instance_url])) {
                            concernsSaved[cpee_instance_url][concern.id] = subject
                        }
                    }
                    return subject
                }
            }
        }
    })

    return subject;
}



