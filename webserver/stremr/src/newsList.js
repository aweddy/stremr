import React, { Component } from 'react';
import './App.css';
import fetch from 'node-fetch';
//import ReactDOM from 'react-dom';
import axios from 'axios';

class FetchDemo extends Component {
  state = {
    posts: []
  }

  componentDidMount() {
    axios.get(`http://www.reddit.com/r/${this.props.subreddit}.json`)
      .then(res => {
        const posts = res.data.data.children.map(obj => obj.data);
        this.setState({ posts });
      });
  }

  render() {
    return (
      <div>
        <h1>{`/r/${this.props.subreddit}`}</h1>
        <ul>
          {this.state.posts.map(post =>
            <li key={post.id}>{post.title}</li>
          )}
        </ul>
      </div>
    );
  }
}

export default FetchDemo;