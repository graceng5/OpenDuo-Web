class RtcClient{
    constructor(appid){
        this.appid = appid;
        this.rtc = AgoraRTC.createClient({ mode: 'interop' });
        this.localStream = null;
        this.uid = null;
        this.remoteStreams = [];
        this.videoProfile = "720p_6";
        this.dynamicKey = null;
        this.published = false;
        this.muted = false;

        this.subscribeWindowResizeEvent();
        this.subscribeStreamEvents();
    }

    //life cycle
    init(channelName, autoPublish){
        let deferred = $.Deferred();
        let appid = this.appid;
        let uid = this.uid;
        let client = this.rtc;
        this.getDynamicKey(channelName).then($.proxy(key => {
            client.init(appid,$.proxy(_ => {
                client.join(key, channelName, undefined, $.proxy(uid => {
                    let options = {
                        streamID: uid,
                        audio: true,
                        video: true,
                        screen: false
                    };
                    this.uid = uid;
                    let localStream = AgoraRTC.createStream( options );
                    localStream.setVideoProfile(this.videoProfile);

                    this.localStream = localStream;

                    localStream.init($.proxy(_ => {
                        this.rearrangeStreams();
                        if(autoPublish){
                            client.publish(localStream);
                        }
                        deferred.resolve(localStream);
                    }, this));
                }, this), err => {
                    deferred.reject(err);
                });
            }, this));
        }, this));

        return deferred.promise();
    }


    end(){
        let deferred = $.Deferred();
        let client = this.rtc;
        let localStream = this.localStream;

        if(localStream === null){
            return deferred.resolve().promise();
        }

        this.clearStreams();

        if(this.published){
            client.unpublish(this.localStream);
            this.published = false;
        }
        localStream.close();
        this.localStream = null;

        this.remoteStreams = [];

        client.leave(_ => {
            deferred.resolve();
        }, _ => {
            deferred.reject();
        });
        return deferred;
    }

    applyMute(){
        let localStream = this.localStream;

        if(localStream !== null){
            if(this.muted){
                localStream.disableAudio();
            } else {
                localStream.enableAudio();
            }
        }
    }

    toggleMute(){
        this.muted = !this.muted;
        this.applyMute();
    }

    //events
    subscribeWindowResizeEvent() {
        let videoSize;
        $(window).resize($.proxy(e => {
            videoSize = this.calculateStreamSize();
            if(this.localStream !== null){
                this.resizeStream(this.localStream, videoSize);
            }
        }, this));
    }

    subscribeStreamEvents(){
        let client = this.rtc;
        client.on('stream-added', evt => {
            var stream = evt.stream;
            Logger.log("New stream added: " + stream.getId());
            Logger.log("Timestamp: " + Date.now());
            Logger.log("Subscribe ", stream);
            client.subscribe(stream, function(err) {
                Logger.log("Subscribe stream failed", err);
            });
        });

        client.on('peer-leave', $.proxy(evt => {
            Logger.log("Peer has left: " + evt.uid);
            Logger.log("Timestamp: " + Date.now());
            Logger.log(evt);
            
            this.removeRemoteStream(evt.uid);
            this.rearrangeStreams();
        }, this));

        client.on('stream-subscribed', $.proxy(evt => {
            var stream = evt.stream;
            Logger.log("Got stream-subscribed event");
            Logger.log("Timestamp: " + Date.now());
            Logger.log("Subscribe remote stream successfully: " + stream.getId());
            Logger.log(evt);
            this.addRemoteStream(stream);
            this.rearrangeStreams();
        }, this));

        client.on("stream-removed", evt => {
            var stream = evt.stream;
            Logger.log("Stream removed: " + evt.stream.getId());
            Logger.log("Timestamp: " + Date.now());
            Logger.log(evt);
            this.removeRemoteStream(stream.getId());
            this.rearrangeStreams();
        });

        client.on('stream-published', $.proxy(evt => {
            this.published = true;
        }, this));
    }

    rearrangeStreams(){
        let remoteStreams = this.remoteStreams;
        let localStream = this.localStream;
        this.clearStreams();

        if(localStream === null){
            return;
        }

        Logger.log(`Rearranging streams, local:${localStream.getId()}, remote: ${remoteStreams.length === 0 ?"NONE" : remoteStreams[0].id}`);

        if(remoteStreams.length === 0){
            this.displayStream($("#media-container"), localStream, "fullscreen");
        } else if(remoteStreams.length === 1){
            this.displayStream($("#media-container"), remoteStreams[0].stream, "fullscreen");
            // this.displayStream($("#media-container"), localStream, "side");
        }
    }

    //utils
    clearStreams(){
        $("[role=stream]").remove();
    }

    addRemoteStream(stream){
        this.remoteStreams.push({
            stream: stream,
            id: stream.getId()
        });
    }

    removeRemoteStream(streamId){
        this.remoteStreams = this.remoteStreams.filter(item => {
            return item.id !== streamId;
        });
    }

    resizeStream(stream, size){
        
        $("#" + stream.getId()).css({
            width: `${size.width}px`,
            height: `${size.height}px`
        });
    }

    displayStream(container, stream, mode) {
        // cleanup, if network connection interrupted, user cannot receive any events.
        // after reconnecting, the same node id is reused,
        // so remove html node with same id if exist.
        $(`#${stream.getId()}`).remove();
        container.append(`<div id="${stream.getId()}" class="${stream === this.localStream ? "agora-local" : "agora_remote"}" role="stream" data-stream-id="${stream.getId()}"></div>`);

        if(mode === "fullscreen"){
            let size = this.calculateStreamSize();
            
            $("#" + stream.getId()).css({
                width: `${size.width}px`,
                height: `${size.height}px`
            });
        } else {
            $("#" + stream.getId()).removeClass("side-stream").addClass("side-stream");
            $("#" + stream.getId()).css({
                width: `160px`,
                height: `120px`
            });
        }
        stream.play(stream.getId());
    }
    
    getDynamicKey(channelName){
        // if dynamic not enabled
        return new $.Deferred().resolve(undefined).promise();
        
        // if dynamic key enabled
        // return $.ajax({
        //     url: 'service url to get your dynamic key'
        // })
    }

    getResolutionArray(reso) {
        switch (reso) {
            case "120p":
                return [160, 120];
            case "240p":
                return [320, 240];
            case "360p":
                return [640, 360];
            case "480p":
                return [640, 480];
            case "720p":
                return [1280, 720];
            case "1080p":
                return [1920, 1080];
            default:
                return [1280, 720];
        }
    }

    calculateStreamSize(){
        let viewportWidth = $(window).width(),
            viewportHeight = $(window).height(),
            curResolution = this.getResolutionArray(this.videoProfile),
            width,
            height,
            newWidth,
            newHeight,
            ratioWindow,
            ratioVideo;

        
        width = viewportWidth - 100;
        height = viewportHeight - 80;
        ratioWindow = width / height;
        ratioVideo = curResolution[0] / curResolution[1];
        if (ratioVideo > ratioWindow) {
            // calculate by width
            newWidth = width;
            newHeight = width * curResolution[1] / curResolution[0];
        } else {
            // calculate by height
            newHeight = height;
            newWidth = height * curResolution[0] / curResolution[1];
        }

        newWidth = Math.max(newWidth, 160);
        newHeight = Math.max(newHeight, 120);
        return {
            width: newWidth,
            height: newHeight
        };
    }
}