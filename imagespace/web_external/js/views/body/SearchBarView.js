imagespace.views.SearchBarView = imagespace.View.extend({
    events: {
        'click .im-nav-link': function (event) {
            var link = $(event.currentTarget);
            console.log('click');

            imagespace.router.navigate(link.attr('im-target'), {trigger: true});

            // Must call this after calling navigateTo, since that
            // deactivates all global nav links.
            link.addClass('active');
        },

        'click .im-search-image': function (event) {
            this.imageDetailWidget = new imagespace.views.ImageDetailWidget({
                el: $('#g-dialog-container'),
                image: this.image,
                parentView: this
            });
            this.imageDetailWidget.render();
        },

        'keypress .im-search': function (event) {
            var q = $(event.currentTarget).val();
            if (event.which === 13) {
                var query = encodeURIComponent(q);
                imagespace.router.navigate('search/' + query, {trigger: true});
            }
        },

        'input .im-search': function (event) {
            var q = $(event.currentTarget).val();
            if (q.length > 0) {
                $('.im-search-button').removeAttr('disabled');
            } else {
                $('.im-search-button').attr('disabled', 'disabled');
            }
        },

        'click .im-search-button': function (event) {
            var query = encodeURIComponent($('.im-search').val());
            imagespace.router.navigate('search/' + query, {trigger: true});
        }
    },

    dropzoneEvents: {
        'change #im-files': function () {
            var files = $('#im-files')[0].files;
            _.each(files, function (file) {
                this.upload(file);
            }, this);
        },

        'click #im-upload .icon-upload': function () {
            $('#im-files').click();
        },

        'dragenter #im-upload': function (e) {
            e.stopPropagation();
            e.preventDefault();
            e.originalEvent.dataTransfer.dropEffect = 'copy';
            d3.select('#im-upload')
                .classed('btn-success', true)
                .classed('btn-primary', false);
        },

        'dragleave #im-upload': function (e) {
            e.stopPropagation();
            e.preventDefault();
            d3.select('#im-upload')
                .classed('btn-success', false)
                .classed('btn-primary', true);
        },

        'dragover #im-upload': function (e) {
            e.preventDefault();
        },

        'drop #im-upload': function (e) {
            var files = e.originalEvent.dataTransfer.files;
            e.stopPropagation();
            e.preventDefault();
            if (files.length === 0) {
                this.loadUrl(e.originalEvent.dataTransfer.getData('URL'));
            } else {
                _.each(files, function (file) {
                    this.upload(file);
                }, this);
            }
        }
    },

    initialize: function (settings) {
        this.settings = settings || {};

        if (settings.dropzone === true) {
            _.extend(this.events, this.dropzoneEvents);
        }
    },

    render: function () {
        this.$el.html(imagespace.templates.searchBarWidget(this.settings));
        return this;
    },

    upload: function (file) {
        var reader = new FileReader();

        $('#im-upload')
            .addClass('btn-info disabled')
            .removeClass('btn-default')
            .html('<i class="icon-spin5 animate-spin"></i> Processing ...');

        reader.onload = _.bind(function (e) {
            var data = new Uint8Array(e.target.result);
            girder.restRequest({
                path: 'imagefeatures',
                data: data,
                method: 'POST',
                processData: false,
                contentType: 'application/octet-stream'
            }).done(_.bind(function (image) {
                var dataURLReader = new FileReader();

                dataURLReader.onloadend = _.bind(function () {
                    image.imageUrl = dataURLReader.result;
                    imagespace.userData.images.unshift(image);
                    if (girder.currentUser) {
                        girder.restRequest({
                            path: 'folder?text=Private'
                        }).done(_.bind(function (folders) {
                            var privateFolder = null;
                            folders.forEach(function (folder) {
                                if (folder.parentId === girder.currentUser.id) {
                                    privateFolder = folder;
                                }
                            })
                            if (privateFolder) {
                                this.girderUpload(this.dataURLToBlob(dataURLReader.result), file.name, privateFolder._id, null, _.bind(function (fileObject) {
                                    var location = window.location, item;
                                    image.imageUrl = location.protocol + '//' + location.host + location.pathname + '/girder/api/v1/file/' + fileObject.id + '/download?token=' + girder.cookie.find('girderToken');

                                    console.log('fileObject');
                                    console.log(fileObject);

                                    item = new girder.models.ItemModel({_id: fileObject.attributes.itemId});
                                    image.item_id = fileObject.attributes.itemId;
                                    item._sendMetadata(image, _.bind(function () {
                                        this.render();
                                    }, this));
                                }, this));
                            }
                        }, this));
                    }
                }, this);

                dataURLReader.readAsDataURL(file);
                image.id = file.name;
            }, this));
        }, this);

        reader.readAsArrayBuffer(file);
    },

    loadUrl: function (url) {
        $('#im-upload')
            .addClass('btn-info disabled')
            .removeClass('btn-default')
            .html('<i class="icon-spin5 animate-spin"></i> Processing ...');

        girder.restRequest({
            path: 'imagefeatures',
            data: {
                url: url
            },
            method: 'POST'
        }).done(_.bind(function (image) {
            image.imageUrl = url;
            image.id = url;

            this.addUserImage(image);
        }, this));
    },

    girderUpload: function (data, name, folderId, itemToOverwrite, success, error) {
        success = success || function () {};
        error = error || function () {};

        var file, bindEvents = function (file) {
            file.on('g:upload.complete', function () {
                success(file);
            }).on('g:upload.error', function () {
            }).on('g:upload.error g:upload.errorStarting', function () {
                error(file);
            });
            return file;
        };

        if (itemToOverwrite) {
            // We have the dataset's itemid, but we need its fileid.
            var files = new girder.collections.FileCollection();
            files.altUrl = 'item/' + itemToOverwrite + '/files';

            files.on('g:changed', function () {
                file = bindEvents(files.models[0]);
                file.updateContents(data);
            }).fetch();
        } else {
            var folder = new girder.models.FolderModel({_id: folderId});
            file = bindEvents(new girder.models.FileModel());
            file.uploadToFolder(folder, data, name);
        }

        return file;
    },

    dataURLToBlob: function (dataURL) {
        var BASE64_MARKER = ';base64,';
        if (dataURL.indexOf(BASE64_MARKER) == -1) {
            var parts = dataURL.split(','),
                contentType = parts[0].split(':')[1],
                raw = decodeURIComponent(parts[1]);

            return new Blob([raw], {type: contentType});
        }

        var parts = dataURL.split(BASE64_MARKER),
            contentType = parts[0].split(':')[1],
            raw = window.atob(parts[1]),
            rawLength = raw.length,
            uInt8Array = new Uint8Array(rawLength);

        for (var i = 0; i < rawLength; ++i) {
            uInt8Array[i] = raw.charCodeAt(i);
        }

        return new Blob([uInt8Array], {type: contentType});
    },

    addUserImage: function (image) {
        image.source_query = window.location.href;

        girder.restRequest({
            path: 'folder?text=Private'
        }).done(_.bind(function (folders) {
            var privateFolder = null;
            folders.forEach(function (folder) {
                if (folder.parentId === girder.currentUser.id) {
                    privateFolder = folder;
                }
            })
            if (privateFolder) {
                var item = new girder.models.ItemModel({
                    name: image.id,
                    folderId: privateFolder._id
                });

                item.once('g:saved', _.bind(function () {
                    console.log(item);
                    image.item_id = item.attributes._id;
                    console.log(image);
                    item._sendMetadata(image, _.bind(function () {
                        this.render();
                    }, this), function (error) {
                        // TODO report error
                    })
                }, this)).once('g:error', function (error) {
                    console.log(error);
                }, this).save();
            }
        }, this));
    }
});
